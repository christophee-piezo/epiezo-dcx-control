import { $, runtimeState } from './runtime.js';
import { t } from './preferences.js';

function getCurrentTab() {
  return runtimeState.currentView || document.querySelector('.nav-btn.active')?.dataset.tab || 'dashboard';
}

function refreshCurrentViewTitle(tab = getCurrentTab()) {
  const title = $('current-view-title');
  if (title) {
    title.textContent = t(`views.${tab}`, t('views.dashboard', 'Dashboard'));
  }
}

export function setCurrentView(tab) {
  runtimeState.currentView = tab;

  document.querySelectorAll('.content').forEach((content) => {
    content.classList.remove('active');
  });

  $(tab)?.classList.add('active');

  const navTab = ['sequencer', 'workflow'].includes(tab) ? 'method' : tab;

  document.querySelectorAll('.nav-btn').forEach((navButton) => {
    navButton.classList.toggle('active', navButton.dataset.tab === navTab);
  });

  refreshCurrentViewTitle(tab);
  document.dispatchEvent(new CustomEvent('app:view-changed', { detail: { view: tab } }));
}

export function initNavigation() {
  if (document.body?.dataset.navigationBound === 'true') {
    return;
  }

  document.body.dataset.navigationBound = 'true';
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setCurrentView(button.dataset.tab);
    });
  });

  document.addEventListener('app:language-changed', () => {
    refreshCurrentViewTitle();
  });

  document.addEventListener('app:navigate', (event) => {
    const tab = event?.detail?.tab;
    if (typeof tab === 'string' && tab) {
      setCurrentView(tab);
    }
  });
}
