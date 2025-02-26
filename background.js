chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveMarkdown') {
    // Create a valid filename from the title or use a timestamp
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')  // Replace colons with hyphens
      .replace(/\..+/, ''); // Remove milliseconds
    
    // Get a clean filename from the title if available
    const cleanTitle = request.title ? 
      request.title
        .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace invalid chars with hyphen
        .replace(/-+/g, '-')  // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
        .substring(0, 50) // Limit length
      : 'article';
    
    const filename = `${cleanTitle}-${timestamp}.md`;

    // Convert string content to blob
    const blob = new Blob([request.content], {type: 'text/markdown'});
    // Convert blob to data URL
    const reader = new FileReader();
    reader.onload = function() {
      const dataUrl = reader.result;
      if (request.autoSave) {
        // Auto-save to downloads folder
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });
      } else {
        // Prompt for save location
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        });
      }
    };
    reader.readAsDataURL(blob);
    return true; // Will respond asynchronously
  }
}); 