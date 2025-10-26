// nav.js
// Load header component, control hamburger menu, and highlight current menu item

document.addEventListener('DOMContentLoaded', () => {

  // Load header.html and inject into #header
  fetch('/components/header.html')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load header component');
      return res.text();
    })
    .then(html => {
      const headerContainer = document.getElementById('header');
      headerContainer.innerHTML = html;

      // Setup hamburger toggle
      const menuToggle = document.getElementById('menuToggle');
      const menuList = document.getElementById('menuList');

      if (menuToggle && menuList) {
        menuToggle.addEventListener('click', () => {
          menuList.classList.toggle('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (ev) => {
          const target = ev.target;
          if (!menuList.contains(target) && !menuToggle.contains(target)) {
            menuList.classList.add('hidden');
          }
        });
      }

      // Highlight current page: add 'active' class to the matching link
      const links = document.querySelectorAll('#menuList a');
      const currentPath = window.location.pathname || '/index.html';

      links.forEach(link => {
        // normalize href and pathname comparison
        const href = link.getAttribute('href');
        const aPath = new URL(href, window.location.origin).pathname;
        if (aPath === currentPath) {
          link.classList.add('active');
        }
      });
    })
    .catch(err => {
      console.error('nav.js error:', err);
    });

});
