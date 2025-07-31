// Toggle abstract visibility
document.addEventListener('DOMContentLoaded', function() {
  const abstractButtons = document.querySelectorAll('a.abstract-toggle');
  
  abstractButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      
      const pubRow = this.closest('.pub-row');
      const abstractDiv = pubRow.querySelector('.abstract.hidden');
      
      if (abstractDiv) {
        if (abstractDiv.style.display === 'none' || abstractDiv.style.display === '') {
          abstractDiv.style.display = 'block';
          this.textContent = 'HIDE ABSTRACT';
        } else {
          abstractDiv.style.display = 'none';
          this.textContent = 'ABSTRACT';
        }
      }
    });
  });
}); 