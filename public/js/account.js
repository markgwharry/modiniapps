(function () {
  'use strict';

  function createStore(reducer, initialState) {
    let state = initialState;
    const listeners = new Set();

    function getState() {
      return state;
    }

    function dispatch(action) {
      state = reducer(state, action);
      listeners.forEach((listener) => listener());
      return action;
    }

    function subscribe(listener) {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    return { getState, dispatch, subscribe };
  }

  function validateProfile(values) {
    const errors = [];
    const trimmedName = (values.fullName || '').trim();
    const trimmedJob = (values.jobTitle || '').trim();
    const trimmedPhone = (values.phone || '').trim();

    if (!trimmedName) {
      errors.push('Full name is required');
    } else if (trimmedName.length < 2) {
      errors.push('Full name must be at least 2 characters');
    }

    if (trimmedJob.length > 120) {
      errors.push('Job title must be 120 characters or fewer');
    }

    if (trimmedPhone && !/^\+?[0-9 ()-]{7,20}$/.test(trimmedPhone)) {
      errors.push('Phone number must contain only digits and basic punctuation');
    }

    return { errors, values: { fullName: trimmedName, jobTitle: trimmedJob, phone: trimmedPhone } };
  }

  function validatePassword(values) {
    const errors = [];
    const currentPassword = values.currentPassword || '';
    const newPassword = values.newPassword || '';
    const confirmPassword = values.confirmPassword || '';

    if (!currentPassword) {
      errors.push('Current password is required');
    }

    if (!newPassword) {
      errors.push('New password is required');
    } else if (newPassword.length < 8) {
      errors.push('New password must be at least 8 characters long');
    } else if (currentPassword && currentPassword === newPassword) {
      errors.push('New password must be different from your current password');
    }

    if (newPassword !== confirmPassword) {
      errors.push('New password and confirmation do not match');
    }

    return { errors };
  }

  function renderErrors(container, errors) {
    if (!container) return;
    if (!errors || errors.length === 0) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    container.innerHTML = '<ul>' + errors.map((error) => `<li>${error}</li>`).join('') + '</ul>';
  }

  const profileForm = document.querySelector('[data-profile-form]');
  if (profileForm) {
    const initialStateNode = document.getElementById('profile-state');
    let initialValues = { fullName: '', jobTitle: '', phone: '' };
    if (initialStateNode) {
      try {
        const parsed = JSON.parse(initialStateNode.textContent || '{}');
        if (parsed && parsed.values) {
          initialValues = Object.assign(initialValues, parsed.values);
        }
      } catch (error) {
        console.warn('Failed to parse profile state', error);
      }
    }

    const store = createStore(
      function reducer(state, action) {
        switch (action.type) {
          case 'FIELD_CHANGE':
            return {
              values: Object.assign({}, state.values, { [action.payload.name]: action.payload.value }),
              errors: [],
              dirty: true,
            };
          case 'SET_ERRORS':
            return Object.assign({}, state, { errors: action.payload });
          default:
            return state;
        }
      },
      { values: initialValues, errors: [], dirty: false }
    );

    const runtimeErrorContainer = profileForm.querySelector('[data-runtime-errors]');
    const serverErrorContainer = profileForm.querySelector('[data-server-errors]');
    const serverSuccessContainer = profileForm.querySelector('[data-server-success]');

    store.subscribe(function () {
      const state = store.getState();
      renderErrors(runtimeErrorContainer, state.errors);
      if (state.dirty && serverErrorContainer) {
        serverErrorContainer.hidden = true;
      }
      if (state.dirty && serverSuccessContainer) {
        serverSuccessContainer.hidden = true;
      }
    });

    profileForm.addEventListener('input', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      store.dispatch({ type: 'FIELD_CHANGE', payload: { name: target.name, value: target.value } });
    });

    profileForm.addEventListener('submit', function (event) {
      const state = store.getState();
      const validation = validateProfile(state.values);
      if (validation.errors.length > 0) {
        event.preventDefault();
        store.dispatch({ type: 'SET_ERRORS', payload: validation.errors });
      } else {
        Object.keys(validation.values).forEach(function (key) {
          const input = profileForm.elements.namedItem(key);
          if (input && 'value' in input) {
            input.value = validation.values[key];
          }
        });
      }
    });
  }

  const passwordForm = document.querySelector('[data-password-form]');
  if (passwordForm) {
    const store = createStore(
      function reducer(state, action) {
        switch (action.type) {
          case 'FIELD_CHANGE':
            return {
              values: Object.assign({}, state.values, { [action.payload.name]: action.payload.value }),
              errors: [],
            };
          case 'SET_ERRORS':
            return Object.assign({}, state, { errors: action.payload });
          default:
            return state;
        }
      },
      {
        values: { currentPassword: '', newPassword: '', confirmPassword: '' },
        errors: [],
      }
    );

    const runtimeErrorContainer = passwordForm.querySelector('[data-runtime-errors]');
    const serverErrorContainer = passwordForm.querySelector('[data-server-errors]');
    const serverSuccessContainer = passwordForm.querySelector('[data-server-success]');

    store.subscribe(function () {
      const state = store.getState();
      renderErrors(runtimeErrorContainer, state.errors);
      if (state.errors.length && serverSuccessContainer) {
        serverSuccessContainer.hidden = true;
      }
      if (state.errors.length && serverErrorContainer) {
        serverErrorContainer.hidden = true;
      }
    });

    passwordForm.addEventListener('input', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      store.dispatch({ type: 'FIELD_CHANGE', payload: { name: target.name, value: target.value } });
    });

    passwordForm.addEventListener('submit', function (event) {
      const state = store.getState();
      const validation = validatePassword(state.values);
      if (validation.errors.length > 0) {
        event.preventDefault();
        store.dispatch({ type: 'SET_ERRORS', payload: validation.errors });
      }
    });
  }
})();
