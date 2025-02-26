document.addEventListener('DOMContentLoaded', async () => {
  const { autoSave = false } = await chrome.storage.sync.get('autoSave');
  document.getElementById('autoSave').checked = autoSave;
});

document.getElementById('autoSave').addEventListener('change', async (e) => {
  await chrome.storage.sync.set({ autoSave: e.target.checked });
  
  const status = document.getElementById('status');
  status.textContent = 'Settings saved!';
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
}); 