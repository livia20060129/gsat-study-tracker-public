document.querySelector('[data-copy-prompt]')?.addEventListener('click', async function copyPrompt() {
  const text = document.getElementById('prompt').innerText.trim();
  try {
    await navigator.clipboard.writeText(text);
    this.textContent = '已複製';
    setTimeout(() => { this.textContent = '複製完整 Prompt'; }, 1600);
  } catch { alert('瀏覽器未允許自動複製，請使用 Ctrl+A / Ctrl+C。'); }
});
