/* App — init */
document.addEventListener('DOMContentLoaded', async () => {
  FormHandler.init();

  // Check if portal is open (batch != 0)
  const status = await API.checkPortalStatus();
  if (!status.open) {
    document.getElementById('form-content').style.display = 'none';
    document.getElementById('portal-locked').style.display = '';
  }
});
