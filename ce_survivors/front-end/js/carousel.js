// carousel.js
// Card carousel with slide-in (from right) -> center -> slide-out (to left) animation
// Interval defaults to 2000ms (2 seconds) between slides

document.addEventListener('DOMContentLoaded', () => {

  const cardStack = document.getElementById('card-stack');
  if (!cardStack) return;

  // Fetch borough counts from backend API
  fetch('/api/borough-latest')
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data) || data.length === 0) {
        cardStack.innerHTML = '<div class="card"><div class="msg">No data available</div></div>';
        return;
      }

      // Build card elements
      data.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-index', idx);
        card.innerHTML = `
          <div class="card-inner">
            <div class="borough">${escapeHtml(item.borough)}</div>
            <div class="count">${numberWithCommas(item.count)}</div>
          </div>
        `;
        cardStack.appendChild(card);
      });

      const cards = Array.from(cardStack.querySelectorAll('.card'));
      let current = 0;
      const intervalMs = 2000; // 2 seconds

      // Prepare initial positions: all offscreen to right except first
      function resetPositions() {
        cards.forEach((c, i) => {
          c.style.transition = 'none';
          c.style.opacity = '0';
          c.style.transform = 'translate(120%, -50%) scale(0.95)';
        });
        // show first immediately
        const first = cards[0];
        first.style.transition = 'transform 600ms cubic-bezier(.2,.9,.3,1), opacity 400ms ease';
        first.style.opacity = '1';
        first.style.transform = 'translate(-50%, -50%) scale(1)';
      }

      resetPositions();

      // Slide to next card: current slides left out, next slides in from right
      function slideNext() {
        const outCard = cards[current];
        const nextIndex = (current + 1) % cards.length;
        const inCard = cards[nextIndex];

        // Animate outCard to left
        outCard.style.transition = 'transform 600ms cubic-bezier(.2,.9,.3,1), opacity 400ms ease';
        outCard.style.transform = 'translate(-220%, -50%) rotate(-6deg) scale(0.95)';
        outCard.style.opacity = '0';

        // Prepare inCard from right (without visual jump)
        inCard.style.transition = 'none';
        inCard.style.transform = 'translate(120%, -50%) scale(0.95)';
        inCard.style.opacity = '0';

        // Force reflow then animate inCard to center
        void inCard.offsetWidth;

        inCard.style.transition = 'transform 600ms cubic-bezier(.2,.9,.3,1), opacity 400ms ease';
        inCard.style.transform = 'translate(-50%, -50%) scale(1)';
        inCard.style.opacity = '1';

        current = nextIndex;
      }

      // Start automatic loop
      setInterval(slideNext, intervalMs);
    })
    .catch(err => {
      console.error('carousel fetch error:', err);
      cardStack.innerHTML = '<div class="card"><div class="msg">Error loading data</div></div>';
    });

  // Utility: escape HTML to avoid injection
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (s) => {
      const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
      return map[s];
    });
  }

  // Utility: format numbers with commas
  function numberWithCommas(x) {
    if (typeof x !== 'number') return x;
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

});
