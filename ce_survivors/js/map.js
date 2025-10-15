document.querySelectorAll('.borough').forEach(b => {
  b.addEventListener('click', () => {
    const name = b.dataset.borough;
    window.location.href = `borough.html?name=${encodeURIComponent(name)}`;
  });
});
