async function updatePopup() {
  const STORAGE_KEY = 'yokai_owned_data';
  const storage = await chrome.storage.local.get(STORAGE_KEY);
  const ownedData = storage[STORAGE_KEY] || {};

  const ownedCount = Object.values(ownedData).filter(item => item.owned).length;
  // Note: We don't know the total count until we visit the page, 
  // but we can estimate or store the last seen total count.
  // For now, let's just show the owned count if total is unknown.
  
  let totalCount = 1685; // Fallback
  try {
    const response = await fetch(chrome.runtime.getURL('data/medals.json'));
    const metadata = await response.json();
    totalCount = Object.keys(metadata).length;
  } catch (e) {
    console.warn('Could not fetch medals.json for total count:', e);
  }

  const progress = Math.round((ownedCount / totalCount) * 100) || 0;

  document.getElementById('progress-text').textContent = `${progress}%`;
  document.getElementById('count-text').textContent = `${ownedCount} / ${totalCount} メダル`;
  document.getElementById('progress-circle').style.setProperty('--progress', `${progress}%`);
}

updatePopup();
