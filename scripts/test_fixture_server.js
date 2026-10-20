/**
 * Deterministic 5-Page Local Test Fixture Server
 * Port: 4321 (distinct from FastAPI port 8000)
 */

const http = require('http');

const PORT = 4321;

const PAGES = {
  '/': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Alpha Corp - Modern Cloud SEO & Analytics</title>
  <meta name="description" content="Alpha Corp provides cutting edge cloud enterprise solutions for growing businesses.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="http://127.0.0.1:4321/">
  <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css">
  <script src="/wp-includes/js/wp-embed.min.js"></script>
</head>
<body class="home blog wp-custom-logo">
  <header>
    <h1>Enterprise Cloud SEO Solutions</h1>
    <nav>
      <a href="/about">About Us</a>
      <a href="/products">Products</a>
      <a href="/contact">Contact</a>
      <a href="/blog">Blog</a>
    </nav>
  </header>
  <main>
    <img src="/logo.png" alt="Alpha Corp Enterprise Logo">
    <p>Empowering organizations with automated high-speed website auditing.</p>
  </main>
</body>
</html>`,

  '/about': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>About Alpha Corp - Leadership & Mission</title>
  <meta name="description" content="Learn about the mission, values, and visionary engineering team at Alpha Corp.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="http://127.0.0.1:4321/about">
  <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css">
</head>
<body>
  <h1>About Our Visionary Team</h1>
  <nav><a href="/">Home</a> | <a href="/products">Products</a></nav>
  <p>Founded by systems engineers dedicated to browser-native auditing performance.</p>
</body>
</html>`,

  '/products': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Cloud Products & Enterprise Software - Alpha Corp</title>
  <meta name="description" content="Discover high performance cloud products designed to scale with your architecture.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="http://127.0.0.1:4321/products">
</head>
<body>
  <h1>Innovative Cloud Products</h1>
  <nav><a href="/">Home</a> | <a href="/contact">Contact</a></nav>
  <p>Robust distributed tools built for web performance and technical optimization.</p>
</body>
</html>`,

  '/contact': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Contact Alpha Corp Support & Inquiries</title>
  <meta name="description" content="Get in touch with our dedicated customer support engineers 24 hours a day.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="http://127.0.0.1:4321/contact">
</head>
<body>
  <h1>Contact Our Specialists</h1>
  <nav><a href="/">Home</a> | <a href="/blog">Blog</a></nav>
  <p>Reach out to receive instant technical consultation.</p>
</body>
</html>`,

  '/blog': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Engineering Blog & Technical Insights</title>
  <meta name="description" content="Read engineering articles, architectural case studies, and performance benchmarks.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="http://127.0.0.1:4321/blog">
</head>
<body>
  <h1>Technical Insights & Best Practices</h1>
  <nav><a href="/">Home</a> | <a href="/page/1">Module 1</a></nav>
  <p>Exploring Manifest V3 background service workers and zero-backend web crawling.</p>
</body>
</html>`,

  '/robots.txt': `User-agent: *
Disallow: /admin/
Allow: /
Sitemap: http://127.0.0.1:4321/sitemap.xml
`
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath === '/sitemap.xml') {
    const urls = ['/', '/about', '/products', '/contact', '/blog'];
    for (let i = 1; i <= 260; i++) urls.push(`/page/${i}`);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>http://127.0.0.1:${PORT}${u}</loc></url>`).join('\n')}
</urlset>`;
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Powered-By': 'PHP/8.2.0',
      'Server': 'Apache/2.4.52',
    });
    res.end(xml);
    return;
  }

  if (urlPath.startsWith('/page/')) {
    const id = parseInt(urlPath.replace('/page/', ''), 10) || 1;
    const isDup = id === 26;
    const canonical = isDup ? `http://127.0.0.1:${PORT}/page/25` : `http://127.0.0.1:${PORT}/page/${id}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Engineering Benchmark Page ${id} - Alpha Corp</title>
  <meta name="description" content="Technical documentation and architectural benchmarks for distributed service module ${id}.">
  <meta name="generator" content="WordPress 6.4.3">
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css">
</head>
<body>
  <h1>Engineering Benchmark Module ${id}</h1>
  <nav>
    <a href="/">Home</a> |
    <a href="/about">About</a> |
    <a href="/products">Products</a> |
    <a href="/contact">Contact</a> |
    <a href="/blog">Blog</a> |
    <a href="/page/${id + 1}">Next Page ${id + 1}</a> |
    <a href="/page/${id + 2}">Forward Skip ${id + 2}</a>
    ${id > 1 ? `| <a href="/page/${id - 1}">Previous Page ${id - 1}</a>` : ''}
  </nav>
  <main>
    <img src="/logo.png" alt="Architecture Diagram Module ${id}">
    <p>This is deterministic benchmark fixture content for module ${id}. High speed browser-native crawling requires predictable memory allocation, bounded CPU task scheduling, and isolated IndexedDB transactions. Pages are interconnected to simulate real enterprise web graphs with realistic depth, anchor diversity, and clean HTML structure.</p>
  </main>
</body>
</html>`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Powered-By': 'PHP/8.2.0',
      'Server': 'Apache/2.4.52',
    });
    res.end(html);
    return;
  }

  if (PAGES[urlPath]) {
    const isRobots = urlPath === '/robots.txt';
    res.writeHead(200, {
      'Content-Type': isRobots ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'X-Powered-By': 'PHP/8.2.0',
      'Server': 'Apache/2.4.52',
    });
    res.end(PAGES[urlPath]);
  } else if (urlPath.endsWith('.css')) {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end('body { margin: 0; }');
  } else if (urlPath.endsWith('.js')) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end('console.log("wp-embed loaded");');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Test Server] Multi-Page fixture running at http://127.0.0.1:${PORT}/`);
});
