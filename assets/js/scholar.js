// Toggle abstract visibility
document.addEventListener('DOMContentLoaded', function() {
  const abstractButtons = document.querySelectorAll('a.abstract-toggle');
  
  abstractButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      
      const pubRow = this.closest('.pub-row');
      const abstractDiv = pubRow.querySelector('.abstract');
      
      if (abstractDiv) {
        if (abstractDiv.classList.contains('hidden')) {
          abstractDiv.classList.remove('hidden');
          this.textContent = 'HIDE ABSTRACT';
        } else {
          abstractDiv.classList.add('hidden');
          this.textContent = 'ABSTRACT';
        }
      }
    });
  });
}); 