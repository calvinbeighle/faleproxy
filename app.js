const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const url = require('url');

const app = express();
const PORT = 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Function to replace colors in CSS content
function replaceColorsInCSS(cssContent) {
    // Replace hex color (case-insensitive)
    cssContent = cssContent.replace(/#00356B/gi, '#A51C30');
    // Replace rgb color
    cssContent = cssContent.replace(/rgb\(0,\s*53,\s*107\)/g, 'rgb(165, 28, 48)');
    // Replace rgba color
    cssContent = cssContent.replace(/rgba\(0,\s*53,\s*107,\s*[0-9.]+\)/g, (match) => {
        const alpha = match.match(/[\d.]+\)$/)[0];
        return `rgba(165, 28, 48, ${alpha}`;
    });
    return cssContent;
}

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Proxy endpoint for fetching resources (images, CSS, etc.)
app.get('/proxy-resource', async (req, res) => {
  try {
    const resourceUrl = req.query.url;
    if (!resourceUrl) {
      return res.status(400).json({ error: 'Resource URL is required' });
    }

    const response = await axios.get(resourceUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Set appropriate content type
    const contentType = response.headers['content-type'];
    
    // If it's CSS, process the content
    if (contentType && contentType.includes('text/css')) {
      const cssContent = response.data.toString('utf8');
      const processedCSS = replaceColorsInCSS(cssContent);
      res.setHeader('Content-Type', 'text/css');
      res.send(processedCSS);
    } else {
      res.setHeader('Content-Type', contentType);
      res.send(response.data);
    }
  } catch (error) {
    console.error('Error fetching resource:', error.message);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url: targetUrl } = req.body;
    
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;

    // Use cheerio to parse HTML
    const $ = cheerio.load(html);
    const baseUrl = new URL(targetUrl).origin;

    // Process all resource URLs (images, CSS, scripts)
    $('img, link[rel="stylesheet"], script').each((i, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('href');
      
      if (src) {
        // Convert relative URLs to absolute
        const absoluteUrl = new URL(src, baseUrl).href;
        // Replace with our proxy URL
        const proxyUrl = `/proxy-resource?url=${encodeURIComponent(absoluteUrl)}`;
        
        if ($el.is('img')) {
          $el.attr('src', proxyUrl);
        } else if ($el.is('link')) {
          $el.attr('href', proxyUrl);
        } else if ($el.is('script')) {
          $el.attr('src', proxyUrl);
        }
      }
    });

    // Process inline styles
    $('[style]').each((i, el) => {
      const $el = $(el);
      const style = $el.attr('style');
      if (style) {
        // Replace colors in inline styles
        const newStyle = replaceColorsInCSS(style);
        $el.attr('style', newStyle);
      }
    });

    // Process style tags
    $('style').each((i, el) => {
      const $el = $(el);
      const styleContent = $el.html();
      if (styleContent) {
        const newStyleContent = replaceColorsInCSS(styleContent);
        $el.html(newStyleContent);
      }
    });

    // Process title
    const title = $('title').text();
    
    // Add color replacement script to handle JavaScript-rendered styles
    const colorReplacementScript = `
      <script>
        // Function to replace colors in computed styles
        function replaceComputedColors() {
          const elements = document.getElementsByTagName('*');
          for (let element of elements) {
            const computedStyle = window.getComputedStyle(element);
            const color = computedStyle.color;
            const backgroundColor = computedStyle.backgroundColor;
            
            // Check for hex color and rgb values
            if (color === '#00356B' || color === 'rgb(0, 53, 107)') {
              element.style.color = '#A51C30';
            }
            if (backgroundColor === '#00356B' || backgroundColor === 'rgb(0, 53, 107)') {
              element.style.backgroundColor = '#A51C30';
            }

            // Check for other properties that might use colors
            const borderColor = computedStyle.borderColor;
            const borderTopColor = computedStyle.borderTopColor;
            const borderBottomColor = computedStyle.borderBottomColor;
            const borderLeftColor = computedStyle.borderLeftColor;
            const borderRightColor = computedStyle.borderRightColor;

            if (borderColor === '#00356B' || borderColor === 'rgb(0, 53, 107)') {
              element.style.borderColor = '#A51C30';
            }
            if (borderTopColor === '#00356B' || borderTopColor === 'rgb(0, 53, 107)') {
              element.style.borderTopColor = '#A51C30';
            }
            if (borderBottomColor === '#00356B' || borderBottomColor === 'rgb(0, 53, 107)') {
              element.style.borderBottomColor = '#A51C30';
            }
            if (borderLeftColor === '#00356B' || borderLeftColor === 'rgb(0, 53, 107)') {
              element.style.borderLeftColor = '#A51C30';
            }
            if (borderRightColor === '#00356B' || borderRightColor === 'rgb(0, 53, 107)') {
              element.style.borderRightColor = '#A51C30';
            }
          }
        }

        // Run on page load
        replaceComputedColors();

        // Create observer to handle dynamically added elements
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
              replaceComputedColors();
            }
          });
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class']
        });

        // Also run when dynamic styles might be added
        document.addEventListener('DOMContentLoaded', replaceComputedColors);
        window.addEventListener('load', replaceComputedColors);
      </script>
    `;

    // Add the script before closing body tag
    $('body').append(colorReplacementScript);
    
    return res.json({ 
      success: true, 
      content: $.html(),
      title: title,
      originalUrl: targetUrl
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Web proxy server running at http://localhost:${PORT}`);
});
