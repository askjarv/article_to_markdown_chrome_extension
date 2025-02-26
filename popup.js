let currentTags = new Set();
let allTags = new Set();
let pageContent = null;
let currentMarkdown = '';
let isMarkdownView = true;
let hasSelection = false;
let fullPageMarkdown = '';
let selectionMarkdown = '';

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved tags
  const { savedTags = [] } = await chrome.storage.local.get('savedTags');
  allTags = new Set(savedTags);
  updateTagSuggestions();

  // Get current tab content
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Get the page content first
  const [{ result: pageContentResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getPageContent,
  });

  // Store pageContent in the wider scope
  pageContent = pageContentResult;

  // Convert to markdown in the popup context where Turndown is available
  fullPageMarkdown = convertPageToMarkdown(pageContentResult);
  
  // If there's a selection, convert it to markdown as well
  if (pageContentResult.selection) {
    hasSelection = true;
    selectionMarkdown = convertSelectionToMarkdown(pageContentResult);
    document.getElementById('selectionInfo').style.display = 'block';
  }
  
  // Set initial markdown based on selection if available
  currentMarkdown = hasSelection ? selectionMarkdown : fullPageMarkdown;

  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });
  
  // Show initial markdown preview
  updatePreview();

  // Setup event listeners
  document.getElementById('tagInput').addEventListener('input', handleTagInput);
  document.getElementById('saveButton').addEventListener('click', () => saveArticle(currentMarkdown));
  document.getElementById('togglePreview').addEventListener('click', togglePreview);
  
  if (hasSelection) {
    document.getElementById('useSelection').addEventListener('change', (e) => {
      currentMarkdown = e.target.checked ? selectionMarkdown : fullPageMarkdown;
      updatePreview();
    });
  }
});

function updatePreview() {
  const previewElement = document.querySelector('.preview');
  const toggleButton = document.getElementById('togglePreview');
  
  if (isMarkdownView) {
    previewElement.textContent = currentMarkdown;
    previewElement.classList.remove('rendered');
    toggleButton.textContent = 'Show HTML Preview';
  } else {
    previewElement.innerHTML = marked.parse(currentMarkdown);
    previewElement.classList.add('rendered');
    toggleButton.textContent = 'Show Markdown';
  }
}

function togglePreview() {
  isMarkdownView = !isMarkdownView;
  updatePreview();
}

// Function that runs in the page context to get content
function getPageContent() {
  // Helper function to get text content length without spaces
  const getTextLength = (element) => {
    return element.textContent.trim().replace(/\s+/g, '').length;
  };

  // Helper function to calculate link density
  const getLinkDensity = (element) => {
    const textLength = getTextLength(element);
    const linkLength = Array.from(element.getElementsByTagName('a'))
      .reduce((sum, link) => sum + getTextLength(link), 0);
    return textLength > 0 ? linkLength / textLength : 1;
  };

  function findArticleContent() {
    // Common article container selectors
    const selectors = [
      'article',
      '[role="article"]',
      '.post-content',
      '.article-content',
      '.post-body',
      '.entry-content',
      '#article-content',
      '.content-body',
      'main'
    ];

    // Try to find element by selector
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && getTextLength(element) > 500 && getLinkDensity(element) < 0.5) {
        return element;
      }
    }

    // Fallback: Find largest content block with reasonable link density
    let bestElement = document.body;
    let maxScore = 0;

    const candidates = document.querySelectorAll('div, section, main');
    candidates.forEach(element => {
      const textLength = getTextLength(element);
      const linkDensity = getLinkDensity(element);
      
      // Score based on text length and inverse link density
      const score = textLength * (1 - linkDensity);

      if (score > maxScore && textLength > 500 && linkDensity < 0.5) {
        maxScore = score;
        bestElement = element;
      }
    });

    return bestElement;
  }

  // Clean up content before conversion
  function cleanupContent(element) {
    const clone = element.cloneNode(true);
    
    // Remove unwanted elements
    const unwanted = [
      '.advertisement',
      '.social-share',
      '.related-articles',
      '.newsletter-signup',
      '.comments',
      'script',
      'style',
      'iframe',
      'nav',
      'header:not(article header)',
      'footer:not(article footer)'
    ];
    
    unwanted.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    return clone;
  }

  // Get the selected content if any
  const selection = window.getSelection();
  let selectedHtml = '';
  if (selection && selection.rangeCount > 0) {
    const container = document.createElement('div');
    const range = selection.getRangeAt(0);
    container.appendChild(range.cloneContents());
    selectedHtml = container.innerHTML;
  }

  // Get the main content
  const articleElement = findArticleContent();
  const cleanArticle = cleanupContent(articleElement);

  // Get metadata
  const title = document.title.split('|')[0].trim();
  const url = window.location.href;
  const author = document.querySelector('[rel="author"], .author, .byline')?.textContent.trim() || '';
  const date = document.querySelector('[datetime], time, .date, .published')?.textContent.trim() || '';

  // Return the content and metadata
  return {
    html: cleanArticle.outerHTML,
    selection: selectedHtml,
    title,
    url,
    author,
    date
  };
}

// Function that runs in the popup context where Turndown is available
function convertPageToMarkdown(pageContent) {
  // Initialize Turndown
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });

  // Add custom rules for Turndown
  turndownService.addRule('codeBlocks', {
    filter: ['pre'],
    replacement: function(content, node) {
      const language = node.querySelector('code')?.className.replace('language-', '') || '';
      return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
    }
  });

  turndownService.addRule('figures', {
    filter: 'figure',
    replacement: function(content, node) {
      const img = node.querySelector('img');
      const caption = node.querySelector('figcaption');
      if (img) {
        return `![${caption?.textContent || img.alt || ''}](${img.src})\n${caption ? `_${caption.textContent}_\n` : ''}`;
      }
      return content;
    }
  });

  // Convert HTML to Markdown
  const markdown = turndownService.turndown(pageContent.html);

  // Format the final markdown document
  return `# ${pageContent.title}

${pageContent.author ? `Author: ${pageContent.author}` : ''}
${pageContent.date ? `Date: ${pageContent.date}` : ''}
Source: ${pageContent.url}

${markdown}`;
}

function convertSelectionToMarkdown(pageContent) {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });

  // Add the same custom rules as before
  turndownService.addRule('codeBlocks', {
    filter: ['pre'],
    replacement: function(content, node) {
      const language = node.querySelector('code')?.className.replace('language-', '') || '';
      return `\n\`\`\`${language}\n${content}\n\`\`\`\n`;
    }
  });

  turndownService.addRule('figures', {
    filter: 'figure',
    replacement: function(content, node) {
      const img = node.querySelector('img');
      const caption = node.querySelector('figcaption');
      if (img) {
        return `![${caption?.textContent || img.alt || ''}](${img.src})\n${caption ? `_${caption.textContent}_\n` : ''}`;
      }
      return content;
    }
  });

  const markdown = turndownService.turndown(pageContent.selection);

  return `# ${pageContent.title} (Selected Excerpt)

${pageContent.author ? `Author: ${pageContent.author}` : ''}
${pageContent.date ? `Date: ${pageContent.date}` : ''}
Source: ${pageContent.url}

${markdown}`;
}

async function handleTagInput(e) {
  const input = e.target.value;
  if (input.endsWith(',')) {
    const newTag = input.slice(0, -1).trim();
    if (newTag) {
      currentTags.add(newTag);
      allTags.add(newTag);
      e.target.value = '';
      updateTagDisplay();
      updateTagSuggestions();
      
      // Save updated tags
      await chrome.storage.local.set({ savedTags: Array.from(allTags) });
    }
  }
}

function updateTagSuggestions() {
  const container = document.getElementById('tagSuggestions');
  container.innerHTML = '';
  
  allTags.forEach(tag => {
    if (!currentTags.has(tag)) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = tag;
      pill.addEventListener('click', () => {
        currentTags.add(tag);
        updateTagDisplay();
      });
      container.appendChild(pill);
    }
  });
}

function updateTagDisplay() {
  const container = document.getElementById('selectedTags');
  container.innerHTML = '';
  
  currentTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = `${tag} ×`;
    pill.addEventListener('click', () => {
      currentTags.delete(tag);
      updateTagDisplay();
      updateTagSuggestions();
    });
    container.appendChild(pill);
  });
}

async function saveArticle(markdown) {
  const { autoSave = false } = await chrome.storage.sync.get('autoSave');
  const tags = Array.from(currentTags);
  const content = `---\ntags: ${tags.join(', ')}\n---\n\n${markdown}`;
  
  chrome.runtime.sendMessage({
    action: 'saveMarkdown',
    content,
    title: pageContent.title,
    autoSave
  });
} 