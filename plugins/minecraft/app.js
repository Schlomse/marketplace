const STORAGE_KEY = 'config';
const SETUP_DONE_KEY = 'setupDone';

const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
const VANILLA_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RECENT_FOLDERS_KEY = 'recentFolders';
const DEFAULT_BASE_FOLDERS = [
  'C:\\Servers',
  'C:\\MinecraftServers',
  'C:\\Users\\%USERNAME%\\Documents\\MinecraftServers',
];

const el = {
  path: document.getElementById('serverPath'),
  jar: document.getElementById('jarName'),
  ramMin: document.getElementById('ramMin'),
  ramMax: document.getElementById('ramMax'),
  saveBtn: document.getElementById('saveConfig'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  consoleBtn: document.getElementById('consoleBtn'),
  folderBtn: document.getElementById('folderBtn'),
  log: document.getElementById('log'),
  dot: document.getElementById('statusDot'),
  reopenSetup: document.getElementById('reopenSetup'),
  overlay: document.getElementById('setupOverlay'),
  setupType: document.getElementById('setupType'),
  setupVersion: document.getElementById('setupVersion'),
  setupBaseFolder: document.getElementById('setupBaseFolder'),
  setupServerNameField: document.getElementById('setupServerNameField'),
  setupServerName: document.getElementById('setupServerName'),
  setupCustomPathField: document.getElementById('setupCustomPathField'),
  setupCustomPath: document.getElementById('setupCustomPath'),
  setupPathPreview: document.getElementById('setupPathPreview'),
  setupEula: document.getElementById('setupEula'),
  setupStatus: document.getElementById('setupStatus'),
  setupSkip: document.getElementById('setupSkip'),
  setupDownload: document.getElementById('setupDownload'),
};

function log(msg, kind = '') {
  const line = document.createElement('div');
  line.className = 'entry' + (kind ? ' ' + kind : '');
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${msg}`;
  el.log.appendChild(line);
  el.log.scrollTop = el.log.scrollHeight;
}

function currentConfig() {
  return {
    path: el.path.value.trim(),
    jar: el.jar.value.trim() || 'server.jar',
    ramMin: Number(el.ramMin.value) || 2,
    ramMax: Number(el.ramMax.value) || 4,
  };
}

function applyConfig(cfg) {
  if (!cfg) return;
  el.path.value = cfg.path || '';
  el.jar.value = cfg.jar || 'server.jar';
  el.ramMin.value = cfg.ramMin || 2;
  el.ramMax.value = cfg.ramMax || 4;
}

async function loadConfig() {
  try {
    const cfg = await rc.storage.get(STORAGE_KEY);
    applyConfig(cfg);
    log('Configuration loaded.');
  } catch {
    log('No saved configuration yet — enter your server folder to get started.');
  }
}

async function saveConfig(silent = false) {
  const cfg = currentConfig();
  await rc.storage.set(STORAGE_KEY, cfg);
  if (!silent) log('Configuration saved.', 'ok');
  return cfg;
}

function requirePath(cfg) {
  if (!cfg.path) {
    log('Please set a server folder first.', 'err');
    rc.notify({ title: 'Minecraft', body: 'Set a server folder before continuing.' });
    return false;
  }
  return true;
}

// ---- Start server -----------------------------------------------------
el.startBtn.addEventListener('click', async () => {
  const cfg = await saveConfig(true);
  if (!requirePath(cfg)) return;

  const command = `java -Xms${cfg.ramMin}G -Xmx${cfg.ramMax}G -jar ${cfg.jar} nogui`;

  try {
    await rc.terminals.create({ cwd: cfg.path, command });
    await rc.views.open('terminals');
    el.dot.classList.add('running');
    log(`Started server: ${command}`, 'ok');
    log('Tip: this terminal IS your live console — type commands directly into it (e.g. "stop", "say hi").');
    rc.notify({ title: 'Minecraft', body: 'Server starting — check the terminal tab.' });
  } catch (e) {
    log('Failed to start server: ' + e.message, 'err');
  }
});

// ---- Open a console terminal in the server folder ----------------------
el.consoleBtn.addEventListener('click', async () => {
  const cfg = await saveConfig(true);
  if (!requirePath(cfg)) return;

  try {
    await rc.terminals.create({ cwd: cfg.path });
    await rc.views.open('terminals');
    log('Opened a terminal in the server folder.');
  } catch (e) {
    log('Failed to open terminal: ' + e.message, 'err');
  }
});

// ---- Show folder structure ---------------------------------------------
el.folderBtn.addEventListener('click', async () => {
  const cfg = await saveConfig(true);
  if (!requirePath(cfg)) return;

  try {
    await rc.terminals.create({ cwd: cfg.path, command: 'tree /F /A' });
    await rc.views.open('terminals');
    log('Printed folder structure to a new terminal (tree /F /A).');
  } catch (e) {
    log('Failed to list folder: ' + e.message, 'err');
  }
});

// ---- Force stop (kills the java process by matching the jar name) ------
el.stopBtn.addEventListener('click', async () => {
  const cfg = await saveConfig(true);
  if (!requirePath(cfg)) return;

  const sure = confirm(
    `Force-stop the server?\n\nThis kills the Java process running "${cfg.jar}" ` +
    `immediately — it skips the normal save routine and can cause data/world ` +
    `loss. Prefer typing "stop" in the server's console terminal if it's ` +
    `still responsive.`
  );
  if (!sure) {
    log('Force stop cancelled.');
    return;
  }

  const psCommand =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { $_.CommandLine -like '*${cfg.jar}*' } | ` +
    `ForEach-Object { Write-Host "Stopping PID" $_.ProcessId; Stop-Process -Id $_.ProcessId -Force }`;
  const command = `powershell -NoProfile -Command "${psCommand}"`;

  try {
    await rc.terminals.create({ command });
    await rc.views.open('terminals');
    el.dot.classList.remove('running');
    log(`Force-stop issued for processes matching "${cfg.jar}".`, 'err');
    rc.notify({ title: 'Minecraft', body: 'Force-stop command sent.' });
  } catch (e) {
    log('Failed to send stop command: ' + e.message, 'err');
  }
});

// ---- Save button ---------------------------------------------------------
el.saveBtn.addEventListener('click', () => saveConfig());

// =========================================================================
// FIRST-RUN SETUP WIZARD
// =========================================================================

function setStatus(msg, kind = '') {
  el.setupStatus.textContent = msg;
  el.setupStatus.className = 'hint small' + (kind ? ' ' + kind : '');
}

function showSetup() {
  el.overlay.classList.remove('hidden');
  loadVersions(el.setupType.value);
  initFolderPicker();
}

function hideSetup() {
  el.overlay.classList.add('hidden');
}

el.reopenSetup.addEventListener('click', showSetup);
el.setupSkip.addEventListener('click', async () => {
  await rc.storage.set(SETUP_DONE_KEY, true);
  hideSetup();
});

el.setupType.addEventListener('change', () => {
  loadVersions(el.setupType.value);
  suggestServerName();
});

async function loadVersions(type) {
  el.setupVersion.innerHTML = '<option value="">Loading versions…</option>';
  try {
    const versions = type === 'paper' ? await fetchPaperVersions() : await fetchVanillaVersions();
    if (!versions.length) throw new Error('empty version list');
    el.setupVersion.innerHTML = versions
      .map((v, i) => `<option value="${v}"${i === 0 ? ' selected' : ''}>${v}</option>`)
      .join('');
  } catch (e) {
    // Fallback list in case the API can't be reached from here
    const fallback = ['1.21.4', '1.21.1', '1.20.6', '1.20.1', '1.19.4'];
    el.setupVersion.innerHTML = fallback.map(v => `<option value="${v}">${v}</option>`).join('');
    setStatus('Could not fetch a live version list, showing a fallback selection.', 'err');
  }
  suggestServerName();
}

async function fetchPaperVersions() {
  const res = await fetch(PAPER_API);
  if (!res.ok) throw new Error(`Paper API returned ${res.status}`);
  const data = await res.json();
  // data.versions groups versions by major line, e.g. { "1.21": ["1.21.4", ...], "1.20": [...] }
  const groups = Object.values(data.versions || {});
  return groups.flat();
}

async function fetchVanillaVersions() {
  const res = await fetch(VANILLA_MANIFEST);
  if (!res.ok) throw new Error(`Mojang manifest returned ${res.status}`);
  const data = await res.json();
  return (data.versions || []).filter(v => v.type === 'release').map(v => v.id);
}

async function resolvePaperDownload(version) {
  const res = await fetch(`${PAPER_API}/versions/${version}/builds`);
  if (!res.ok) throw new Error(`Paper API returned ${res.status} for version ${version}`);
  const builds = await res.json();
  if (!Array.isArray(builds) || builds.length === 0) {
    throw new Error(`No builds available for ${version}`);
  }
  const build = builds.find(b => b.channel === 'STABLE') || builds[0];
  const download = build.downloads && build.downloads['server:default'];
  if (!download || !download.url) {
    throw new Error(`No server jar published for ${version} build ${build.id}`);
  }
  return { url: download.url, build: build.id };
}

async function resolveVanillaDownload(version) {
  const manifestRes = await fetch(VANILLA_MANIFEST);
  if (!manifestRes.ok) throw new Error(`Mojang manifest returned ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const entry = (manifest.versions || []).find(v => v.id === version);
  if (!entry) throw new Error('Version not found in manifest');
  const versionRes = await fetch(entry.url);
  if (!versionRes.ok) throw new Error(`Version metadata returned ${versionRes.status}`);
  const versionData = await versionRes.json();
  const server = versionData.downloads && versionData.downloads.server;
  if (!server || !server.url) throw new Error(`${version} has no server jar (too old?)`);
  return { url: server.url };
}

// ---- Folder picker (dropdown of common/recent locations + custom) ------
let nameTouched = false;

async function initFolderPicker() {
  let recent = [];
  try {
    recent = (await rc.storage.get(RECENT_FOLDERS_KEY)) || [];
  } catch {
    recent = [];
  }

  const options = [];
  if (recent.length) {
    options.push(`<optgroup label="Recently used">`);
    recent.forEach(f => options.push(`<option value="${f}">${f}</option>`));
    options.push(`</optgroup>`);
  }
  options.push(`<optgroup label="Common locations">`);
  DEFAULT_BASE_FOLDERS.forEach((f, i) => {
    options.push(`<option value="${f}"${!recent.length && i === 0 ? ' selected' : ''}>${f}</option>`);
  });
  options.push(`</optgroup>`);
  options.push(`<option value="__custom__">Custom path…</option>`);

  el.setupBaseFolder.innerHTML = options.join('');
  onBaseFolderChange();
  suggestServerName();
}

function onBaseFolderChange() {
  const isCustom = el.setupBaseFolder.value === '__custom__';
  el.setupServerNameField.classList.toggle('hidden', isCustom);
  el.setupCustomPathField.classList.toggle('hidden', !isCustom);
  updatePathPreview();
}

function suggestServerName() {
  if (nameTouched && el.setupServerName.value.trim()) {
    updatePathPreview();
    return;
  }
  const type = el.setupType.value;
  const version = el.setupVersion.value || 'server';
  el.setupServerName.value = `${type}-${version}`;
  updatePathPreview();
}

function computeSetupPath() {
  if (el.setupBaseFolder.value === '__custom__') {
    return el.setupCustomPath.value.trim();
  }
  const base = el.setupBaseFolder.value;
  const name = el.setupServerName.value.trim() || 'minecraft-server';
  return `${base}\\${name}`;
}

function updatePathPreview() {
  const path = computeSetupPath();
  el.setupPathPreview.textContent = path ? `Install path: ${path}` : 'Choose a location and folder name.';
}

el.setupBaseFolder.addEventListener('change', onBaseFolderChange);
el.setupServerName.addEventListener('input', () => {
  nameTouched = true;
  updatePathPreview();
});
el.setupCustomPath.addEventListener('input', updatePathPreview);

async function rememberFolder(path) {
  let recent = [];
  try {
    recent = (await rc.storage.get(RECENT_FOLDERS_KEY)) || [];
  } catch {
    recent = [];
  }
  recent = [path, ...recent.filter(f => f !== path)].slice(0, 5);
  await rc.storage.set(RECENT_FOLDERS_KEY, recent);
}

el.setupDownload.addEventListener('click', async () => {
  const type = el.setupType.value;
  const version = el.setupVersion.value;
  const path = computeSetupPath();

  if (!path) return setStatus('Please choose or enter an install folder.', 'err');
  if (!version) return setStatus('Please choose a version.', 'err');
  if (!el.setupEula.checked) return setStatus('You need to accept the Minecraft EULA to continue.', 'err');

  setStatus('Resolving download URL…');
  el.setupDownload.disabled = true;

  try {
    const { url } = type === 'paper'
      ? await resolvePaperDownload(version)
      : await resolveVanillaDownload(version);

    const psCommand =
      `New-Item -ItemType Directory -Force -Path "${path}" | Out-Null; ` +
      `Write-Host "Downloading ${type} ${version}..."; ` +
      `Invoke-WebRequest -Uri "${url}" -OutFile "${path}\\server.jar"; ` +
      `Set-Content -Path "${path}\\eula.txt" -Value "eula=true"; ` +
      `Write-Host "Done. server.jar is ready in ${path}"`;
    const command = `powershell -NoProfile -Command "${psCommand}"`;

    await rc.terminals.create({ command });
    await rc.views.open('terminals');

    // Save config so the main tab is pre-filled and future opens skip setup
    el.path.value = path;
    el.jar.value = 'server.jar';
    await saveConfig(true);
    await rc.storage.set(SETUP_DONE_KEY, true);
    await rememberFolder(path);

    setStatus('Download started — check the terminal tab for progress.', 'ok');
    log(`Setup: downloading ${type} ${version} into ${path}`, 'ok');
    rc.notify({ title: 'Minecraft', body: `Downloading ${type} ${version}…` });

    setTimeout(hideSetup, 1200);
  } catch (e) {
    setStatus('Could not resolve or start the download: ' + e.message, 'err');
  } finally {
    el.setupDownload.disabled = false;
  }
});

async function maybeShowSetupOnFirstOpen() {
  try {
    const done = await rc.storage.get(SETUP_DONE_KEY);
    if (!done) showSetup();
  } catch {
    // key not set yet -> first run
    showSetup();
  }
}

loadConfig();
maybeShowSetupOnFirstOpen();
