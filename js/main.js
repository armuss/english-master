document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }

  document.querySelectorAll('.nav-item.has-dropdown').forEach(function (item) {
    var trigger = item.querySelector('.dropdown-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.nav-item.has-dropdown.open').forEach(function (other) {
        if (other !== item) other.classList.remove('open');
      });
      item.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.nav-item.has-dropdown.open').forEach(function (item) {
      item.classList.remove('open');
      var trigger = item.querySelector('.dropdown-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.nav-item.has-dropdown.open').forEach(function (item) {
        item.classList.remove('open');
      });
    }
  });

  var leadForm = document.getElementById('leadForm');
  if (leadForm) {
    var consentScroll = document.getElementById('consentScroll');
    var consentCheckbox = document.getElementById('consentCheckbox');
    var consentRow = document.getElementById('consentRow');
    var consentHint = document.getElementById('consentHint');
    if (consentScroll && consentCheckbox) {
      var unlockConsent = function () {
        var reachedEnd = consentScroll.scrollTop + consentScroll.clientHeight >= consentScroll.scrollHeight - 4;
        if (reachedEnd) {
          consentCheckbox.disabled = false;
          if (consentHint) consentHint.style.display = 'none';
          if (consentRow) consentRow.classList.add('consent-ready');
        }
      };
      consentScroll.addEventListener('scroll', unlockConsent);
      unlockConsent();
    }

    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var success = document.getElementById('formSuccess');
      var error = document.getElementById('formError');
      var submitBtn = leadForm.querySelector('button[type="submit"]');
      if (success) success.classList.remove('visible');
      if (error) error.classList.remove('visible');
      if (submitBtn) submitBtn.disabled = true;

      var payload = {
        name: leadForm.name.value,
        phone: leadForm.phone.value,
        email: leadForm.email.value,
        course: leadForm.course ? leadForm.course.value : '',
        branch: leadForm.branch ? leadForm.branch.value : '',
        message: leadForm.message ? leadForm.message.value : '',
        consent: !!(consentCheckbox && consentCheckbox.checked),
      };

      fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('submit failed');
          if (success) success.classList.add('visible');
          leadForm.reset();
          if (consentCheckbox) {
            consentCheckbox.disabled = true;
            if (consentHint) consentHint.style.display = '';
            if (consentRow) consentRow.classList.remove('consent-ready');
          }
        })
        .catch(function () {
          if (error) error.classList.add('visible');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
});
