(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('TU-PROYECTO') &&
    !cfg.SUPABASE_ANON_KEY.includes('TU-ANON')
  );

  const S = {
    sb: null,
    session: null,
    profile: null,
    mode: 'public',
    publicService: null,
    services: [],
    materials: [],
    stocks: [],
    extraStocks: [],
    profiles: [],
    history: [],
    extraHistory: [],
    tab: 'dashboard',
    adminService: null,
    stockDrafts: new Map(),
    extraDrafts: new Map(),
    channel: null,
    timer: null,
    handlingSession: false
  };

  const E = {};
  const M = {};
  const dtf = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  let initialized = false;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (initialized) return;
    initialized = true;
    document.querySelectorAll('[id]').forEach((element) => { E[element.id] = element; });

    M.adminLogin = new bootstrap.Modal(E.adminLoginModal);
    M.extraMaterial = new bootstrap.Modal(E.extraMaterialModal);
    M.service = new bootstrap.Modal(E.serviceModal);
    M.material = new bootstrap.Modal(E.materialModal);
    M.user = new bootstrap.Modal(E.userModal);
    M.toast = new bootstrap.Toast(E.appToast, { delay: 3200 });

    bindEvents();
    document.title = cfg.APP_NAME || 'Stock Clean It';
    E.appTitle.textContent = document.title;
    E.publicReporterName.value = localStorage.getItem('stockCleanItReporter') || '';

    if (!configured) {
      E.loadingScreen.classList.add('d-none');
      E.setupWarning.classList.remove('d-none');
      E.publicStartButton.disabled = true;
      E.openAdminLoginButton.disabled = true;
      showPublicEntry();
      return;
    }

    S.sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    S.sb.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => handleSession(session), 0);
    });

    const { data, error } = await S.sb.auth.getSession();
    if (error) toast('No se pudo recuperar la sesión.', 'error');
    await handleSession(data?.session || null);
  }

  function bindEvents() {
    E.publicEntryForm.addEventListener('submit', startPublicInventory);
    E.openAdminLoginButton.addEventListener('click', openAdminLogin);
    E.headerAdminLoginButton.addEventListener('click', openAdminLogin);
    E.switchServiceButton.addEventListener('click', requestServiceSwitch);
    E.emptySwitchServiceButton.addEventListener('click', requestServiceSwitch);

    E.loginForm.addEventListener('submit', login);
    E.logoutButton.addEventListener('click', () => S.sb?.auth.signOut());
    E.togglePassword.addEventListener('click', togglePassword);

    E.operatorSearch.addEventListener('input', renderOperatorGrid);
    E.operatorCategory.addEventListener('change', renderOperatorGrid);
    E.operatorSaveButton.addEventListener('click', () => saveInventory(currentServiceId(), 'operator'));
    E.addExtraMaterialButton.addEventListener('click', openExtraMaterial);
    E.extraMaterialForm.addEventListener('submit', saveExtraMaterial);

    E.adminInventoryService.addEventListener('change', () => {
      if (hasPendingDrafts(S.adminService) && !confirm('Hay cambios sin guardar. ¿Querés cambiar de servicio y descartarlos?')) {
        E.adminInventoryService.value = S.adminService || '';
        return;
      }
      clearDrafts(S.adminService);
      S.adminService = E.adminInventoryService.value || null;
      renderAdminInventory();
    });
    E.adminInventorySearch.addEventListener('input', renderAdminGrid);
    E.adminInventoryCategory.addEventListener('change', renderAdminGrid);
    E.adminInventorySaveButton.addEventListener('click', () => saveInventory(S.adminService, 'admin'));

    E.appShell.addEventListener('click', appClick);
    E.appShell.addEventListener('input', stockInput);

    E.refreshAdminButton.addEventListener('click', () => refreshAdmin(true));
    E.adminServiceSearch.addEventListener('input', renderDashboard);
    E.materialsSearch.addEventListener('input', renderMaterials);
    E.materialsStatusFilter.addEventListener('change', renderMaterials);

    E.addServiceButton.addEventListener('click', () => openService());
    E.serviceForm.addEventListener('submit', saveService);
    E.addMaterialButton.addEventListener('click', () => openMaterial());
    E.materialForm.addEventListener('submit', saveMaterial);
    E.materialImageFile.addEventListener('change', previewImage);
    E.userForm.addEventListener('submit', saveUser);

    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.adminTab));
    });
  }

  async function handleSession(session) {
    if (S.handlingSession) return;
    if (session?.access_token && S.session?.access_token === session.access_token && S.profile) return;

    S.handlingSession = true;
    S.session = session;
    showLoading();

    try {
      if (!session) {
        teardownRealtime();
        S.profile = null;
        S.mode = 'public';
        S.profiles = [];
        S.history = [];
        S.extraHistory = [];
        clearAllDrafts();
        await loadPublicData(null);
        showPublicEntry();
        return;
      }

      const { data, error } = await S.sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (error || !data) throw new Error('El usuario no tiene perfil. Ejecutá el esquema SQL y revisá el trigger de perfiles.');

      S.profile = data;
      S.mode = data.role === 'admin' ? 'admin' : 'operator-auth';

      if (S.mode === 'admin') {
        await refreshAdmin(false);
        setupRealtime();
        showAdminApp();
      } else {
        teardownRealtime();
        await refreshAuthenticatedOperator();
        showOperatorApp();
      }
    } catch (error) {
      console.error(error);
      if (session) {
        await S.sb.auth.signOut();
        S.session = null;
        S.profile = null;
        S.mode = 'public';
        try { await loadPublicData(null); } catch (publicError) { console.error(publicError); }
      }
      showPublicEntry();
      showEntryError(error.message || 'No se pudo iniciar la aplicación.');
    } finally {
      S.handlingSession = false;
      E.loadingScreen.classList.add('d-none');
    }
  }

  async function loadPublicData(serviceId) {
    const { data, error } = await S.sb.rpc('public_inventory_bootstrap', { p_service_id: serviceId || null });
    if (error) throw new Error(publicRpcMessage(error));
    const payload = typeof data === 'string' ? JSON.parse(data) : (data || {});

    S.services = Array.isArray(payload.services) ? payload.services : [];
    S.materials = Array.isArray(payload.materials) ? payload.materials : [];
    S.stocks = Array.isArray(payload.stocks) ? payload.stocks : [];
    S.extraStocks = Array.isArray(payload.extra_stocks) ? payload.extra_stocks : [];
    S.publicService = serviceId || null;
    populateCategories();
  }

  async function refreshAuthenticatedOperator() {
    if (!S.profile) return;
    const [servicesResult, materialsResult, stocksResult, extrasResult] = await Promise.all([
      S.sb.from('services').select('*').order('name'),
      S.sb.from('materials').select('*').order('category').order('sort_order').order('name'),
      S.sb.from('service_stock').select('*').order('updated_at', { ascending: false }),
      S.sb.from('service_extra_stock').select('*').order('name')
    ]);
    [servicesResult, materialsResult, stocksResult, extrasResult].forEach((result) => {
      if (result.error) throw result.error;
    });
    S.services = servicesResult.data || [];
    S.materials = materialsResult.data || [];
    S.stocks = stocksResult.data || [];
    S.extraStocks = extrasResult.data || [];
    populateCategories();
  }

  async function refreshAdmin(feedback = false) {
    if (S.mode !== 'admin') return;
    if (feedback) buttonBusy(E.refreshAdminButton, true, 'Actualizando...');

    try {
      const [servicesResult, materialsResult, stocksResult, extrasResult, profilesResult, historyResult, extraHistoryResult] = await Promise.all([
        S.sb.from('services').select('*').order('name'),
        S.sb.from('materials').select('*').order('category').order('sort_order').order('name'),
        S.sb.from('service_stock').select('*').order('updated_at', { ascending: false }),
        S.sb.from('service_extra_stock').select('*').order('name'),
        S.sb.from('profiles').select('*').order('full_name'),
        S.sb.from('stock_history').select('*').order('changed_at', { ascending: false }).limit(300),
        S.sb.from('extra_stock_history').select('*').order('changed_at', { ascending: false }).limit(300)
      ]);

      [servicesResult, materialsResult, stocksResult, extrasResult, profilesResult, historyResult, extraHistoryResult].forEach((result) => {
        if (result.error) throw result.error;
      });

      S.services = servicesResult.data || [];
      S.materials = materialsResult.data || [];
      S.stocks = stocksResult.data || [];
      S.extraStocks = extrasResult.data || [];
      S.profiles = profilesResult.data || [];
      S.history = historyResult.data || [];
      S.extraHistory = extraHistoryResult.data || [];

      if (!S.adminService || !S.services.some((item) => item.id === S.adminService && item.active)) {
        S.adminService = S.services.find((item) => item.active)?.id || S.services[0]?.id || null;
      }

      populateCategories();
      if (!E.appShell.classList.contains('d-none')) renderAdmin();
      if (feedback) toast('Datos actualizados.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudieron actualizar los datos.', 'error');
    } finally {
      if (feedback) buttonBusy(E.refreshAdminButton, false);
    }
  }

  function setupRealtime() {
    teardownRealtime();
    if (!S.sb || S.mode !== 'admin') return;

    S.channel = S.sb.channel(`stock-admin-${S.profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_stock' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_extra_stock' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_history' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_stock_history' }, scheduleAdminRefresh)
      .subscribe();
  }

  function teardownRealtime() {
    if (S.channel && S.sb) S.sb.removeChannel(S.channel);
    S.channel = null;
  }

  function scheduleAdminRefresh() {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => refreshAdmin(false), 450);
  }

  function showLoading() {
    E.loadingScreen.classList.remove('d-none');
  }

  function showPublicEntry() {
    E.loadingScreen.classList.add('d-none');
    E.appShell.classList.add('d-none');
    E.authView.classList.remove('d-none');
    populatePublicServiceSelect();
  }

  function showOperatorApp() {
    E.authView.classList.add('d-none');
    E.appShell.classList.remove('d-none');
    E.adminView.classList.add('d-none');
    E.operatorView.classList.remove('d-none');
    E.adminMenuButton.classList.add('d-none');

    const isPublic = S.mode === 'public';
    E.switchServiceButton.classList.toggle('d-none', !isPublic);
    E.headerAdminLoginButton.classList.toggle('d-none', !isPublic);
    E.logoutButton.classList.toggle('d-none', isPublic);
    E.headerUserChip.classList.remove('d-none');
    E.headerUserName.textContent = isPublic
      ? (localStorage.getItem('stockCleanItReporter') || 'Operario')
      : (S.profile?.full_name || S.profile?.email || 'Operario');
    E.headerUserRole.textContent = isPublic ? 'Carga pública' : 'Operario';
    E.appSubtitle.textContent = 'Relevamiento de servicio';
    renderOperator();
  }

  function showAdminApp() {
    E.authView.classList.add('d-none');
    E.appShell.classList.remove('d-none');
    E.operatorView.classList.add('d-none');
    E.adminView.classList.remove('d-none');
    E.adminMenuButton.classList.remove('d-none');
    E.switchServiceButton.classList.add('d-none');
    E.headerAdminLoginButton.classList.add('d-none');
    E.logoutButton.classList.remove('d-none');
    E.headerUserChip.classList.remove('d-none');
    E.headerUserName.textContent = S.profile?.full_name || S.profile?.email || 'Administrador';
    E.headerUserRole.textContent = 'Administrador';
    E.appSubtitle.textContent = 'Administración de inventario';
    renderAdmin();
  }

  function populatePublicServiceSelect() {
    const activeServices = S.services.filter((item) => item.active !== false);
    const remembered = S.publicService || localStorage.getItem('stockCleanItService') || '';
    E.publicServiceSelect.innerHTML = '<option value="">Seleccionar servicio...</option>' + activeServices.map((item) => (
      `<option value="${ea(item.id)}">${eh(item.name)}${item.address ? ` · ${eh(item.address)}` : ''}</option>`
    )).join('');
    if (activeServices.some((item) => item.id === remembered)) E.publicServiceSelect.value = remembered;
    E.publicStartButton.disabled = !configured || activeServices.length === 0;
    if (activeServices.length === 0 && configured) showEntryError('No hay servicios activos cargados.');
  }

  async function startPublicInventory(event) {
    event.preventDefault();
    hideEntryError();
    const serviceId = E.publicServiceSelect.value;
    if (!serviceId) {
      showEntryError('Seleccioná el servicio donde vas a cargar el stock.');
      return;
    }

    const reporter = E.publicReporterName.value.trim();
    localStorage.setItem('stockCleanItService', serviceId);
    if (reporter) localStorage.setItem('stockCleanItReporter', reporter);
    else localStorage.removeItem('stockCleanItReporter');

    buttonBusy(E.publicStartButton, true, 'Abriendo inventario...');
    showLoading();
    try {
      clearAllDrafts();
      await loadPublicData(serviceId);
      S.mode = 'public';
      showOperatorApp();
    } catch (error) {
      console.error(error);
      showPublicEntry();
      showEntryError(error.message || 'No se pudo cargar el servicio.');
    } finally {
      E.loadingScreen.classList.add('d-none');
      buttonBusy(E.publicStartButton, false);
    }
  }

  function requestServiceSwitch() {
    const serviceId = currentServiceId();
    if (hasPendingDrafts(serviceId) && !confirm('Hay cambios sin guardar. ¿Querés salir y descartarlos?')) return;
    clearDrafts(serviceId);
    S.publicService = serviceId;
    showPublicEntry();
  }

  function openAdminLogin() {
    hideLoginError();
    M.adminLogin.show();
    setTimeout(() => E.loginEmail.focus(), 250);
  }

  async function login(event) {
    event.preventDefault();
    hideLoginError();
    loginBusy(true);
    try {
      const { error } = await S.sb.auth.signInWithPassword({
        email: E.loginEmail.value.trim(),
        password: E.loginPassword.value
      });
      if (error) throw error;
      M.adminLogin.hide();
    } catch (error) {
      showLoginError(authMessage(error));
    } finally {
      loginBusy(false);
    }
  }

  function togglePassword() {
    const show = E.loginPassword.type === 'password';
    E.loginPassword.type = show ? 'text' : 'password';
    E.togglePassword.innerHTML = `<i class="bi bi-eye${show ? '-slash' : ''}"></i>`;
  }

  function authMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (message.includes('email not confirmed')) return 'El correo todavía no fue confirmado.';
    return error?.message || 'No se pudo iniciar sesión.';
  }

  function loginBusy(value) {
    E.loginButton.disabled = value;
    E.loginButton.querySelector('.login-label').classList.toggle('d-none', value);
    E.loginButton.querySelector('.login-spinner').classList.toggle('d-none', !value);
  }

  function showLoginError(message) {
    E.loginError.textContent = message;
    E.loginError.classList.remove('d-none');
  }

  function hideLoginError() {
    E.loginError.classList.add('d-none');
    E.loginError.textContent = '';
  }

  function showEntryError(message) {
    E.publicEntryError.textContent = message;
    E.publicEntryError.classList.remove('d-none');
  }

  function hideEntryError() {
    E.publicEntryError.classList.add('d-none');
    E.publicEntryError.textContent = '';
  }

  function populateCategories() {
    const categories = [...new Set(S.materials.map((item) => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    if (S.extraStocks.some((item) => item.active !== false)) categories.push('Agregados por operario');

    [E.operatorCategory, E.adminInventoryCategory].forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="all">Todas las categorías</option>' + categories.map((category) => (
        `<option value="${ea(category)}">${eh(category)}</option>`
      )).join('');
      select.value = categories.includes(current) ? current : 'all';
    });

    const masterCategories = [...new Set(S.materials.map((item) => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    E.categorySuggestions.innerHTML = masterCategories.map((category) => `<option value="${ea(category)}"></option>`).join('');
  }

  function currentServiceId() {
    if (S.mode === 'public') return S.publicService;
    if (S.mode === 'operator-auth') return S.profile?.service_id || null;
    return S.adminService;
  }

  function renderOperator() {
    const selectedService = service(currentServiceId());
    const hasService = Boolean(selectedService);
    E.operatorNoService.classList.toggle('d-none', hasService);
    E.operatorContent.classList.toggle('d-none', !hasService);
    E.operatorSaveBar.classList.toggle('d-none', !hasService);
    if (!selectedService) return;

    const data = summary(selectedService.id);
    E.operatorServiceName.textContent = selectedService.name;
    E.operatorServiceAddress.textContent = selectedService.address || 'Dirección no informada';
    E.operatorLastUpdate.textContent = data.last ? relative(data.last) : 'Sin informar';
    E.operatorCriticalCount.textContent = data.critical;
    E.operatorLowCount.textContent = data.low;
    E.operatorOkCount.textContent = data.ok;
    E.operatorUnreportedCount.textContent = data.unreported;
    renderOperatorGrid();
    renderDraftIndicator();
  }

  function renderOperatorGrid() {
    renderGrid(
      E.operatorInventoryGrid,
      currentServiceId(),
      E.operatorSearch.value,
      E.operatorCategory.value,
      'operator'
    );
  }

  function renderAdmin() {
    renderDashboard();
    renderAdminInventory();
    renderMaterials();
    renderServices();
    renderUsers();
    renderHistory();
    switchTab(S.tab, false);
  }

  function switchTab(tab, setState = true) {
    if (setState) S.tab = tab;
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.classList.toggle('d-none', panel.dataset.panel !== tab);
    });
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.adminTab === tab);
    });
  }

  function renderDashboard() {
    if (S.mode !== 'admin') return;
    const activeServices = S.services.filter((item) => item.active);
    const summaries = activeServices.map((item) => ({ service: item, data: summary(item.id) }));

    E.adminKpiServices.textContent = activeServices.length;
    E.adminKpiCritical.textContent = summaries.reduce((total, item) => total + item.data.critical, 0);
    E.adminKpiStale.textContent = summaries.filter((item) => item.data.stale).length;
    E.adminKpiMaterials.textContent = activeMaterials().length;

    const query = norm(E.adminServiceSearch.value);
    summaries.sort((a, b) => risk(b.data) - risk(a.data) || a.service.name.localeCompare(b.service.name, 'es'));
    const visible = summaries.filter((item) => norm(`${item.service.name} ${item.service.address || ''}`).includes(query));

    E.serviceHealthList.innerHTML = visible.length ? visible.map(({ service: current, data }) => (
      `<button class="service-health-item text-start" data-open-service-inventory="${current.id}">
        <div><div class="service-health-name">${eh(current.name)}</div><div class="service-health-meta">${data.last ? `Actualizado ${eh(relative(data.last))}` : 'Nunca relevado'}${current.address ? ` · ${eh(current.address)}` : ''}</div></div>
        <div class="health-pills">
          ${data.critical ? `<span class="health-pill bg-danger-subtle text-danger">${data.critical} críticos</span>` : ''}
          ${data.low ? `<span class="health-pill bg-warning-subtle text-warning-emphasis">${data.low} bajos</span>` : ''}
          ${data.unreported ? `<span class="health-pill bg-secondary-subtle text-secondary">${data.unreported} sin informar</span>` : ''}
          ${!data.critical && !data.low && !data.unreported ? '<span class="health-pill bg-success-subtle text-success">Completo</span>' : ''}
        </div>
      </button>`
    )).join('') : empty('No hay servicios que coincidan.');

    const alerts = [];
    activeServices.forEach((current) => {
      activeMaterials().forEach((item) => {
        const currentStock = stock(current.id, item.id);
        if (!currentStock) return;
        const status = stockStatus(currentStock.quantity, item);
        if (status === 'critical' || status === 'low') alerts.push({ service: current, item, quantity: currentStock.quantity, status, extra: false });
      });
      activeExtras(current.id).forEach((item) => {
        const status = stockStatus(item.quantity, item);
        if (status === 'critical' || status === 'low') alerts.push({ service: current, item, quantity: item.quantity, status, extra: true });
      });
    });

    alerts.sort((a, b) => statusWeight(a.status) - statusWeight(b.status) || Number(a.quantity) - Number(b.quantity));
    E.priorityAlertCount.textContent = alerts.length;
    E.priorityAlertsList.innerHTML = alerts.length ? alerts.slice(0, 20).map((alert) => (
      `<button class="priority-item ${alert.status === 'low' ? 'low' : ''} text-start border-0 w-100" data-open-service-inventory="${alert.service.id}">
        <div class="priority-item-title">${eh(alert.item.name)} · ${qty(alert.quantity)}${alert.extra ? ' · adicional' : ''}</div>
        <div class="priority-item-meta">${eh(alert.service.name)} · crítico ≤ ${qty(alert.item.critical_level)} · objetivo ${qty(alert.item.target_level)}</div>
      </button>`
    )).join('') : empty('No hay alertas de stock informadas.', 'bi-check-circle');
  }

  function risk(data) {
    return data.critical * 100 + data.low * 10 + data.unreported + (data.stale ? 50 : 0);
  }

  function statusWeight(status) {
    return status === 'critical' ? 0 : 1;
  }

  function renderAdminInventory() {
    if (S.mode !== 'admin') return;
    const activeServices = S.services.filter((item) => item.active);
    E.adminInventoryService.innerHTML = activeServices.length
      ? activeServices.map((item) => `<option value="${item.id}">${eh(item.name)}</option>`).join('')
      : '<option value="">No hay servicios activos</option>';

    if (S.adminService && activeServices.some((item) => item.id === S.adminService)) {
      E.adminInventoryService.value = S.adminService;
    } else {
      S.adminService = activeServices[0]?.id || null;
      E.adminInventoryService.value = S.adminService || '';
    }

    const selectedService = service(S.adminService);
    const data = selectedService ? summary(selectedService.id) : null;
    const extrasCount = selectedService ? activeExtras(selectedService.id).length : 0;
    E.adminInventorySummary.innerHTML = selectedService
      ? `<strong>${eh(selectedService.name)}</strong> · ${data.last ? `Última actualización: ${eh(fmt(data.last))}` : 'Sin relevamiento'} · <span class="text-danger fw-bold">${data.critical} críticos</span> · <span class="text-warning-emphasis fw-bold">${data.low} bajos</span> · ${data.unreported} sin informar · ${extrasCount} adicionales`
      : 'Creá un servicio para comenzar.';
    renderAdminGrid();
  }

  function renderAdminGrid() {
    renderGrid(
      E.adminInventoryGrid,
      S.adminService,
      E.adminInventorySearch.value,
      E.adminInventoryCategory.value,
      'admin'
    );
    E.adminInventorySaveButton.disabled = !S.adminService;
  }

  function renderGrid(container, serviceId, searchText, category, context) {
    if (!serviceId) {
      container.innerHTML = empty('No hay un servicio seleccionado.');
      return;
    }

    const query = norm(searchText);
    const masterItems = activeMaterials().filter((item) => (
      (category === 'all' || item.category === category) &&
      (!query || norm(`${item.name} ${item.detail || ''} ${item.category}`).includes(query))
    ));

    const extras = activeExtras(serviceId).filter((item) => (
      (category === 'all' || category === 'Agregados por operario') &&
      (!query || norm(`${item.name} ${item.notes || ''} ${item.unit}`).includes(query))
    ));

    container.dataset.serviceId = serviceId;
    const cards = [
      ...masterItems.map((item) => materialCard(serviceId, item, context)),
      ...extras.map((item) => extraCard(serviceId, item, context))
    ];
    container.innerHTML = cards.length ? cards.join('') : empty('No hay insumos que coincidan con el filtro.');
  }

  function materialCard(serviceId, item, context) {
    const currentStock = stock(serviceId, item.id);
    const pending = stockDraft(serviceId, item.id);
    const reported = Boolean(currentStock) || pending !== undefined;
    const value = pending !== undefined ? pending : (currentStock?.quantity ?? 0);
    const status = reported ? stockStatus(value, item) : 'unreported';
    return cardMarkup({ serviceId, item, context, value, status, type: 'material' });
  }

  function extraCard(serviceId, item, context) {
    const pending = extraDraft(serviceId, item.id);
    const value = pending !== undefined ? pending : (item.quantity ?? 0);
    const status = stockStatus(value, item);
    return cardMarkup({ serviceId, item, context, value, status, type: 'extra' });
  }

  function cardMarkup({ serviceId, item, context, value, status, type }) {
    const labels = { unreported: 'Sin informar', critical: 'Crítico', low: 'Bajo', ok: 'Correcto' };
    const isExtra = type === 'extra';
    const image = item.image_url || 'assets/materials/default.svg';
    return `<article class="material-card status-${status}${isExtra ? ' extra-material-card' : ''}" data-item-card="${item.id}" data-item-type="${type}" data-service-id="${serviceId}" data-context="${context}">
      <div class="material-image-wrap">
        <img class="material-image" src="${ea(image)}" alt="${ea(item.name)}" loading="lazy" onerror="this.src='assets/materials/default.svg'">
        <span class="material-status ${status}" data-status-label>${labels[status]}</span>
        ${isExtra ? '<span class="extra-material-badge">No listado</span>' : ''}
      </div>
      <div class="material-body">
        <div class="material-category">${isExtra ? 'Agregado por operario' : eh(item.category)}</div>
        <div class="material-name">${eh(item.name)}</div>
        <div class="material-detail">${eh((isExtra ? item.notes : item.detail) || item.unit)}</div>
        <div class="stock-control">
          <button class="btn btn-outline-secondary" type="button" data-stock-step="-1"><i class="bi bi-dash"></i></button>
          <input class="form-control stock-input" type="number" min="0" step="0.01" value="${ea(inputQty(value))}" data-stock-input data-item-id="${item.id}" data-item-type="${type}" data-service-id="${serviceId}" inputmode="decimal">
          <button class="btn btn-outline-primary" type="button" data-stock-step="1"><i class="bi bi-plus"></i></button>
        </div>
        <div class="stock-unit">${eh(item.unit)}</div>
        <div class="threshold-note">Crítico ≤ ${qty(item.critical_level)} · objetivo ${qty(item.target_level)}</div>
        ${isExtra && context === 'admin' ? `<button class="btn btn-sm btn-link text-danger w-100 mt-2" type="button" data-toggle-extra="${item.id}"><i class="bi bi-archive me-1"></i>Desactivar adicional</button>` : ''}
      </div>
    </article>`;
  }

  function appClick(event) {
    const stepButton = event.target.closest('[data-stock-step]');
    if (stepButton) {
      const card = stepButton.closest('[data-item-card]');
      const input = card?.querySelector('[data-stock-input]');
      if (!card || !input) return;
      const next = Math.max(0, parseQty(input.value) + Number(stepButton.dataset.stockStep));
      input.value = inputQty(next);
      setItemDraft(card.dataset.itemType, card.dataset.serviceId, card.dataset.itemCard, next);
      updateCardStatus(card, next);
      renderDraftIndicator();
      return;
    }

    const openInventory = event.target.closest('[data-open-service-inventory]');
    if (openInventory) {
      S.adminService = openInventory.dataset.openServiceInventory;
      switchTab('inventory');
      renderAdminInventory();
      scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const editServiceButton = event.target.closest('[data-edit-service]');
    if (editServiceButton) return openService(service(editServiceButton.dataset.editService));

    const toggleServiceButton = event.target.closest('[data-toggle-service]');
    if (toggleServiceButton) return toggleService(toggleServiceButton.dataset.toggleService);

    const editMaterialButton = event.target.closest('[data-edit-material]');
    if (editMaterialButton) return openMaterial(material(editMaterialButton.dataset.editMaterial));

    const toggleMaterialButton = event.target.closest('[data-toggle-material]');
    if (toggleMaterialButton) return toggleMaterial(toggleMaterialButton.dataset.toggleMaterial);

    const toggleExtraButton = event.target.closest('[data-toggle-extra]');
    if (toggleExtraButton) return toggleExtra(toggleExtraButton.dataset.toggleExtra);

    const editUserButton = event.target.closest('[data-edit-user]');
    if (editUserButton) return openUser(profile(editUserButton.dataset.editUser));
  }

  function stockInput(event) {
    const input = event.target.closest('[data-stock-input]');
    if (!input) return;
    const card = input.closest('[data-item-card]');
    const value = Math.max(0, parseQty(input.value));
    setItemDraft(input.dataset.itemType, input.dataset.serviceId, input.dataset.itemId, value);
    updateCardStatus(card, value);
    renderDraftIndicator();
  }

  function updateCardStatus(card, value) {
    if (!card) return;
    const item = card.dataset.itemType === 'extra' ? extra(card.dataset.itemCard) : material(card.dataset.itemCard);
    if (!item) return;
    const status = stockStatus(value, item);
    card.classList.remove('status-unreported', 'status-critical', 'status-low', 'status-ok');
    card.classList.add(`status-${status}`);
    const label = card.querySelector('[data-status-label]');
    if (label) {
      label.className = `material-status ${status}`;
      label.textContent = { critical: 'Crítico', low: 'Bajo', ok: 'Correcto' }[status];
    }
  }

  function setItemDraft(type, serviceId, itemId, value) {
    const key = `${serviceId}:${itemId}`;
    if (type === 'extra') S.extraDrafts.set(key, value);
    else S.stockDrafts.set(key, value);
  }

  function stockDraft(serviceId, materialId) {
    return S.stockDrafts.get(`${serviceId}:${materialId}`);
  }

  function extraDraft(serviceId, extraId) {
    return S.extraDrafts.get(`${serviceId}:${extraId}`);
  }

  function hasPendingDrafts(serviceId) {
    if (!serviceId) return false;
    const prefix = `${serviceId}:`;
    return [...S.stockDrafts.keys(), ...S.extraDrafts.keys()].some((key) => key.startsWith(prefix));
  }

  function clearDrafts(serviceId) {
    if (!serviceId) return;
    const prefix = `${serviceId}:`;
    [...S.stockDrafts.keys()].forEach((key) => { if (key.startsWith(prefix)) S.stockDrafts.delete(key); });
    [...S.extraDrafts.keys()].forEach((key) => { if (key.startsWith(prefix)) S.extraDrafts.delete(key); });
  }

  function clearAllDrafts() {
    S.stockDrafts.clear();
    S.extraDrafts.clear();
  }

  function renderDraftIndicator() {
    const serviceId = currentServiceId();
    const prefix = `${serviceId}:`;
    const count = [...S.stockDrafts.keys(), ...S.extraDrafts.keys()].filter((key) => key.startsWith(prefix)).length;
    E.operatorDraftCount.textContent = `${count} cambio${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'}`;
  }

  async function saveInventory(serviceId, context) {
    if (!serviceId) return;
    const button = context === 'admin' ? E.adminInventorySaveButton : E.operatorSaveButton;
    buttonBusy(button, true, 'Guardando...');

    try {
      const stockItems = activeMaterials().map((item) => {
        const currentStock = stock(serviceId, item.id);
        const pending = stockDraft(serviceId, item.id);
        return {
          material_id: item.id,
          quantity: pending !== undefined ? pending : (currentStock?.quantity ?? 0)
        };
      });

      const extraItems = activeExtras(serviceId).map((item) => {
        const pending = extraDraft(serviceId, item.id);
        return { id: item.id, quantity: pending !== undefined ? pending : (item.quantity ?? 0) };
      });

      if (!stockItems.length && !extraItems.length) throw new Error('No hay insumos activos para guardar.');

      if (S.mode === 'public') {
        const reporterName = localStorage.getItem('stockCleanItReporter') || 'Operario sin identificar';
        const { error } = await S.sb.rpc('public_submit_inventory', {
          p_service_id: serviceId,
          p_stock_items: stockItems,
          p_extra_items: extraItems,
          p_reporter_name: reporterName
        });
        if (error) throw new Error(publicRpcMessage(error));
        clearDrafts(serviceId);
        await loadPublicData(serviceId);
      } else {
        const rows = stockItems.map((item) => ({
          service_id: serviceId,
          material_id: item.material_id,
          quantity: item.quantity,
          updated_by: S.session.user.id,
          updated_at: new Date().toISOString()
        }));
        if (rows.length) {
          const { error } = await S.sb.from('service_stock').upsert(rows, { onConflict: 'service_id,material_id' });
          if (error) throw error;
        }
        if (extraItems.length) {
          const results = await Promise.all(extraItems.map((item) => (
            S.sb.from('service_extra_stock').update({
              quantity: item.quantity,
              updated_by: S.session.user.id,
              updated_at: new Date().toISOString()
            }).eq('id', item.id).eq('service_id', serviceId)
          )));
          const failed = results.find((result) => result.error);
          if (failed) throw failed.error;
        }
        clearDrafts(serviceId);
        if (S.mode === 'admin') await refreshAdmin(false);
        else await refreshAuthenticatedOperator();
      }

      if (context === 'admin') renderAdminInventory();
      else renderOperator();
      toast('Relevamiento guardado correctamente.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar el inventario.', 'error');
    } finally {
      buttonBusy(button, false);
      renderDraftIndicator();
    }
  }

  function openExtraMaterial() {
    E.extraMaterialForm.reset();
    E.extraMaterialQuantity.value = '1';
    E.extraMaterialUnit.value = 'unidad';
    M.extraMaterial.show();
    setTimeout(() => E.extraMaterialName.focus(), 250);
  }

  async function saveExtraMaterial(event) {
    event.preventDefault();
    const serviceId = currentServiceId();
    if (!serviceId) return toast('Seleccioná un servicio.', 'error');

    const payload = {
      name: E.extraMaterialName.value.trim(),
      quantity: parseQty(E.extraMaterialQuantity.value),
      unit: E.extraMaterialUnit.value.trim() || 'unidad',
      notes: E.extraMaterialNotes.value.trim() || null
    };
    if (payload.name.length < 2) return toast('Ingresá un nombre válido.', 'error');
    const existingMaster = activeMaterials().find((item) => norm(item.name) === norm(payload.name));
    if (existingMaster) return toast('Ese insumo ya está precargado. Buscalo en el catálogo y cargá su cantidad.', 'error');

    buttonBusy(E.extraMaterialSubmitButton, true, 'Agregando...');
    try {
      if (S.mode === 'public') {
        const reporterName = localStorage.getItem('stockCleanItReporter') || 'Operario sin identificar';
        const { error } = await S.sb.rpc('public_add_extra_stock', {
          p_service_id: serviceId,
          p_name: payload.name,
          p_quantity: payload.quantity,
          p_unit: payload.unit,
          p_notes: payload.notes,
          p_reporter_name: reporterName
        });
        if (error) throw new Error(publicRpcMessage(error));
        await loadPublicData(serviceId);
      } else {
        const existing = activeExtras(serviceId).find((item) => norm(item.name) === norm(payload.name));
        const record = {
          service_id: serviceId,
          name: payload.name,
          quantity: payload.quantity,
          unit: payload.unit,
          notes: payload.notes,
          submitted_by: S.profile?.full_name || S.profile?.email || 'Usuario',
          updated_by: S.session.user.id,
          active: true,
          updated_at: new Date().toISOString()
        };
        const result = existing
          ? await S.sb.from('service_extra_stock').update(record).eq('id', existing.id)
          : await S.sb.from('service_extra_stock').insert(record);
        if (result.error) throw result.error;
        if (S.mode === 'admin') await refreshAdmin(false);
        else await refreshAuthenticatedOperator();
      }

      M.extraMaterial.hide();
      renderOperator();
      toast('Insumo adicional agregado al servicio.', 'success');
      setTimeout(() => {
        const target = [...document.querySelectorAll('[data-item-type="extra"]')]
          .find((card) => norm(extra(card.dataset.itemCard)?.name) === norm(payload.name));
        if (target?.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo agregar el insumo.', 'error');
    } finally {
      buttonBusy(E.extraMaterialSubmitButton, false);
    }
  }

  function renderMaterials() {
    if (S.mode !== 'admin') return;
    const query = norm(E.materialsSearch.value);
    const filter = E.materialsStatusFilter.value;
    const items = S.materials.filter((item) => (
      (!query || norm(`${item.name} ${item.detail || ''} ${item.category}`).includes(query)) &&
      (filter === 'all' || (filter === 'active' ? item.active : !item.active))
    ));

    E.materialsTableBody.innerHTML = items.length ? items.map((item) => (
      `<tr><td><div class="table-material"><img class="table-thumb" src="${ea(item.image_url || 'assets/materials/default.svg')}" onerror="this.src='assets/materials/default.svg'" alt=""><div><div class="table-title">${eh(item.name)}</div><div class="table-subtitle">${eh(item.detail || 'Sin detalle')}</div></div></div></td><td>${eh(item.category)}</td><td>${eh(item.unit)}</td><td>${qty(item.critical_level)}</td><td>${qty(item.target_level)}</td><td>${item.active ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td><td class="text-end"><div class="action-group"><button class="btn btn-light" data-edit-material="${item.id}"><i class="bi bi-pencil"></i></button><button class="btn ${item.active ? 'btn-outline-danger' : 'btn-outline-success'}" data-toggle-material="${item.id}"><i class="bi bi-${item.active ? 'archive' : 'check-lg'}"></i></button></div></td></tr>`
    )).join('') : tableEmpty(7, 'No hay insumos que coincidan.');
  }

  function renderServices() {
    if (S.mode !== 'admin') return;
    E.servicesTableBody.innerHTML = S.services.length ? S.services.map((item) => {
      const data = summary(item.id);
      const users = S.profiles.filter((profileItem) => profileItem.service_id === item.id).length;
      return `<tr><td><div class="table-title">${eh(item.name)}</div><div class="table-subtitle">${eh(item.notes || '')}</div></td><td>${eh(item.address || '—')}</td><td>${data.last ? eh(relative(data.last)) : '<span class="text-danger fw-bold">Nunca</span>'}</td><td>${users}</td><td>${item.active ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td><td class="text-end"><div class="action-group"><button class="btn btn-light" data-edit-service="${item.id}"><i class="bi bi-pencil"></i></button><button class="btn ${item.active ? 'btn-outline-danger' : 'btn-outline-success'}" data-toggle-service="${item.id}"><i class="bi bi-${item.active ? 'archive' : 'check-lg'}"></i></button></div></td></tr>`;
    }).join('') : tableEmpty(6, 'Todavía no hay servicios.');
  }

  function renderUsers() {
    if (S.mode !== 'admin') return;
    E.usersTableBody.innerHTML = S.profiles.length ? S.profiles.map((item) => (
      `<tr><td><div class="table-title">${eh(item.full_name || 'Sin nombre')}</div></td><td>${eh(item.email || '—')}</td><td>${item.role === 'admin' ? '<span class="badge text-bg-primary">Administrador</span>' : '<span class="badge text-bg-light border">Operario especial</span>'}</td><td>${eh(service(item.service_id)?.name || 'Sin asignar')}</td><td class="text-end"><button class="btn btn-light btn-sm" data-edit-user="${item.id}"><i class="bi bi-pencil me-1"></i>Editar</button></td></tr>`
    )).join('') : tableEmpty(5, 'No hay usuarios disponibles.');
  }

  function renderHistory() {
    if (S.mode !== 'admin') return;
    const masterRows = S.history.map((item) => ({
      changed_at: item.changed_at,
      service_id: item.service_id,
      item_name: material(item.material_id)?.name || 'Insumo eliminado',
      old_quantity: item.old_quantity,
      new_quantity: item.new_quantity,
      changed_by: item.changed_by,
      reporter_name: item.reporter_name,
      extra: false
    }));
    const extraRows = S.extraHistory.map((item) => ({
      changed_at: item.changed_at,
      service_id: item.service_id,
      item_name: item.extra_name || extra(item.extra_stock_id)?.name || 'Adicional eliminado',
      old_quantity: item.old_quantity,
      new_quantity: item.new_quantity,
      changed_by: item.changed_by,
      reporter_name: item.reporter_name,
      extra: true
    }));
    const rows = [...masterRows, ...extraRows]
      .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
      .slice(0, 400);

    E.historyTableBody.innerHTML = rows.length ? rows.map((item) => {
      const responsible = profile(item.changed_by)?.full_name || item.reporter_name || 'Sistema';
      return `<tr><td class="text-nowrap">${eh(fmt(item.changed_at))}</td><td>${eh(service(item.service_id)?.name || 'Servicio eliminado')}</td><td>${eh(item.item_name)}${item.extra ? ' <span class="badge text-bg-light border">adicional</span>' : ''}</td><td><strong>${item.old_quantity === null ? '—' : qty(item.old_quantity)} → ${qty(item.new_quantity)}</strong></td><td>${eh(responsible)}</td></tr>`;
    }).join('') : tableEmpty(5, 'No hay movimientos registrados.');
  }

  function openService(item = null) {
    E.serviceModalTitle.textContent = item ? 'Editar servicio' : 'Nuevo servicio';
    E.serviceId.value = item?.id || '';
    E.serviceName.value = item?.name || '';
    E.serviceAddress.value = item?.address || '';
    E.serviceNotes.value = item?.notes || '';
    E.serviceActive.checked = item?.active ?? true;
    M.service.show();
  }

  async function saveService(event) {
    event.preventDefault();
    const id = E.serviceId.value;
    const payload = {
      name: E.serviceName.value.trim(),
      address: E.serviceAddress.value.trim() || null,
      notes: E.serviceNotes.value.trim() || null,
      active: E.serviceActive.checked,
      updated_at: new Date().toISOString()
    };
    if (!payload.name) return;
    const result = id
      ? await S.sb.from('services').update(payload).eq('id', id)
      : await S.sb.from('services').insert(payload);
    if (result.error) return toast(result.error.message, 'error');
    M.service.hide();
    await refreshAdmin(false);
    toast('Servicio guardado.', 'success');
  }

  async function toggleService(id) {
    const item = service(id);
    if (!item) return;
    if (!confirm(`¿Confirmás ${item.active ? 'desactivar' : 'activar'} ${item.name}?`)) return;
    const { error } = await S.sb.from('services').update({ active: !item.active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast(error.message, 'error');
    await refreshAdmin(false);
    toast(`Servicio ${item.active ? 'desactivado' : 'activado'}.`, 'success');
  }

  function openMaterial(item = null) {
    E.materialModalTitle.textContent = item ? 'Editar insumo' : 'Nuevo insumo';
    E.materialId.value = item?.id || '';
    E.materialName.value = item?.name || '';
    E.materialCategory.value = item?.category || '';
    E.materialDetail.value = item?.detail || '';
    E.materialUnit.value = item?.unit || 'unidad';
    E.materialCritical.value = item?.critical_level ?? 0;
    E.materialTarget.value = item?.target_level ?? 1;
    E.materialSort.value = item?.sort_order ?? 100;
    E.materialActive.checked = item?.active ?? true;
    E.materialImageFile.value = '';
    E.materialImagePreview.src = item?.image_url || 'assets/materials/default.svg';
    E.materialImagePreview.dataset.currentUrl = item?.image_url || '';
    M.material.show();
  }

  function previewImage() {
    const file = E.materialImageFile.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    E.materialImagePreview.src = url;
    E.materialImagePreview.onload = () => URL.revokeObjectURL(url);
  }

  async function uploadImage(file, name) {
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${slug(name || 'insumo')}.${extension}`;
    const bucket = cfg.MATERIAL_IMAGE_BUCKET || 'material-images';
    const { error } = await S.sb.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
    return S.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function saveMaterial(event) {
    event.preventDefault();
    buttonBusy(E.materialSubmitButton, true, 'Guardando...');
    try {
      const id = E.materialId.value;
      let imageUrl = E.materialImagePreview.dataset.currentUrl || null;
      const file = E.materialImageFile.files?.[0];
      if (file) imageUrl = await uploadImage(file, E.materialName.value);

      const payload = {
        name: E.materialName.value.trim(),
        slug: `${slug(E.materialName.value)}${id ? '' : `-${Date.now().toString(36)}`}`,
        category: E.materialCategory.value.trim(),
        detail: E.materialDetail.value.trim() || null,
        unit: E.materialUnit.value.trim(),
        critical_level: parseQty(E.materialCritical.value),
        target_level: parseQty(E.materialTarget.value),
        sort_order: Math.max(0, parseInt(E.materialSort.value || '100', 10)),
        image_url: imageUrl,
        active: E.materialActive.checked,
        updated_at: new Date().toISOString()
      };

      if (!payload.name || !payload.category || !payload.unit) throw new Error('Completá nombre, categoría y unidad.');
      if (payload.target_level < payload.critical_level) throw new Error('El stock objetivo no puede ser menor que el nivel crítico.');
      if (id) delete payload.slug;

      const result = id
        ? await S.sb.from('materials').update(payload).eq('id', id)
        : await S.sb.from('materials').insert(payload);
      if (result.error) throw result.error;

      M.material.hide();
      await refreshAdmin(false);
      toast('Insumo guardado.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo guardar el insumo.', 'error');
    } finally {
      buttonBusy(E.materialSubmitButton, false);
    }
  }

  async function toggleMaterial(id) {
    const item = material(id);
    if (!item) return;
    if (!confirm(`¿Confirmás ${item.active ? 'desactivar' : 'activar'} ${item.name}?`)) return;
    const { error } = await S.sb.from('materials').update({ active: !item.active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast(error.message, 'error');
    await refreshAdmin(false);
    toast(`Insumo ${item.active ? 'desactivado' : 'activado'}.`, 'success');
  }

  async function toggleExtra(id) {
    const item = extra(id);
    if (!item || S.mode !== 'admin') return;
    if (!confirm(`¿Confirmás desactivar el insumo adicional “${item.name}” para este servicio?`)) return;
    const { error } = await S.sb.from('service_extra_stock').update({ active: false, updated_by: S.session.user.id }).eq('id', id);
    if (error) return toast(error.message, 'error');
    await refreshAdmin(false);
    toast('Insumo adicional desactivado.', 'success');
  }

  function openUser(item) {
    if (!item) return;
    E.userId.value = item.id;
    E.userFullName.value = item.full_name || '';
    E.userRole.value = item.role || 'operator';
    E.userService.innerHTML = '<option value="">Sin asignar</option>' + S.services.filter((serviceItem) => serviceItem.active).map((serviceItem) => `<option value="${serviceItem.id}">${eh(serviceItem.name)}</option>`).join('');
    E.userService.value = item.service_id || '';
    M.user.show();
  }

  async function saveUser(event) {
    event.preventDefault();
    const payload = {
      full_name: E.userFullName.value.trim(),
      role: E.userRole.value,
      service_id: E.userService.value || null,
      updated_at: new Date().toISOString()
    };
    if (payload.role === 'operator' && !payload.service_id) return toast('Un operario especial debe tener un servicio asignado.', 'error');
    const { error } = await S.sb.from('profiles').update(payload).eq('id', E.userId.value);
    if (error) return toast(error.message, 'error');
    M.user.hide();
    await refreshAdmin(false);
    toast('Usuario actualizado.', 'success');
  }

  function activeMaterials() {
    return S.materials.filter((item) => item.active);
  }

  function activeExtras(serviceId) {
    return S.extraStocks.filter((item) => item.service_id === serviceId && item.active !== false);
  }

  function service(id) {
    return S.services.find((item) => item.id === id) || null;
  }

  function material(id) {
    return S.materials.find((item) => item.id === id) || null;
  }

  function extra(id) {
    return S.extraStocks.find((item) => item.id === id) || null;
  }

  function profile(id) {
    return S.profiles.find((item) => item.id === id) || (S.profile?.id === id ? S.profile : null);
  }

  function stock(serviceId, materialId) {
    return S.stocks.find((item) => item.service_id === serviceId && item.material_id === materialId) || null;
  }

  function summary(serviceId) {
    let critical = 0;
    let low = 0;
    let ok = 0;
    let unreported = 0;
    let last = null;

    activeMaterials().forEach((item) => {
      const currentStock = stock(serviceId, item.id);
      if (!currentStock) {
        unreported += 1;
        return;
      }
      const status = stockStatus(currentStock.quantity, item);
      if (status === 'critical') critical += 1;
      if (status === 'low') low += 1;
      if (status === 'ok') ok += 1;
      last = latestDate(last, currentStock.updated_at);
    });

    activeExtras(serviceId).forEach((item) => {
      const status = stockStatus(item.quantity, item);
      if (status === 'critical') critical += 1;
      if (status === 'low') low += 1;
      if (status === 'ok') ok += 1;
      last = latestDate(last, item.updated_at);
    });

    const staleDays = Number(cfg.STOCK_STALE_DAYS || 7);
    const stale = !last || (Date.now() - last.getTime()) > staleDays * 86400000;
    return { critical, low, ok, unreported, last, stale };
  }

  function latestDate(current, value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return current;
    return !current || date > current ? date : current;
  }

  function stockStatus(value, item) {
    const quantityValue = Number(value) || 0;
    const critical = Number(item.critical_level) || 0;
    const target = Number(item.target_level) || 0;
    if (quantityValue <= critical) return 'critical';
    if (quantityValue < target) return 'low';
    return 'ok';
  }

  function parseQty(value) {
    const number = Number(String(value ?? 0).replace(',', '.'));
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function qty(value) {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function inputQty(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
  }

  function fmt(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dtf.format(date);
  }

  function relative(value) {
    const date = value instanceof Date ? value : new Date(value);
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'recién';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days <= 7 ? `hace ${days} día${days === 1 ? '' : 's'}` : fmt(date);
  }

  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function slug(value) {
    return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'insumo';
  }

  function publicRpcMessage(error) {
    const message = error?.message || 'Error de conexión con Supabase.';
    if (message.includes('public_inventory_bootstrap')) return 'Falta ejecutar la actualización SQL incluida en el proyecto.';
    return message;
  }

  function buttonBusy(button, value, label = 'Procesando...') {
    if (!button) return;
    if (value) {
      button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${eh(label)}`;
    } else {
      button.disabled = false;
      if (button.dataset.original) button.innerHTML = button.dataset.original;
      delete button.dataset.original;
    }
  }

  function toast(message, type = 'info') {
    E.appToast.classList.remove('toast-success', 'toast-error', 'toast-info');
    E.appToast.classList.add(`toast-${type}`);
    E.toastBody.textContent = message;
    M.toast.show();
  }

  function empty(message, icon = 'bi-inbox') {
    return `<div class="text-center text-secondary py-5 w-100"><i class="bi ${icon} fs-2 d-block mb-2"></i>${eh(message)}</div>`;
  }

  function tableEmpty(columns, message) {
    return `<tr><td colspan="${columns}" class="text-center text-secondary py-5">${eh(message)}</td></tr>`;
  }

  function eh(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function ea(value) {
    return eh(value);
  }
})();
