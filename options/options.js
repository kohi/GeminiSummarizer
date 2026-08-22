// Options page controller for Web & YouTube to Gemini Summarizer

document.addEventListener('DOMContentLoaded', async () => {
  const accountsTbody = document.getElementById('accounts-tbody');
  const newAccIndexInput = document.getElementById('new-acc-index');
  const newAccLabelInput = document.getElementById('new-acc-label');
  const btnAddAccount = document.getElementById('btn-add-account');

  const optTemplateSelect = document.getElementById('opt-template-select');
  const templateNameInput = document.getElementById('template-name-input');
  const templateContentInput = document.getElementById('template-content-input');
  const btnNewTemplate = document.getElementById('btn-new-template');
  const btnDeleteTemplate = document.getElementById('btn-delete-template');
  const btnResetTemplates = document.getElementById('btn-reset-templates');

  const optDefaultYtTemplate = document.getElementById('opt-default-yt-template');
  const optDefaultWebTemplate = document.getElementById('opt-default-web-template');

  const optAutoSubmit = document.getElementById('opt-auto-submit');
  const optShowButton = document.getElementById('opt-show-button');
  const optMaxChars = document.getElementById('opt-max-chars');
  const btnSaveTop = document.getElementById('btn-save-top');
  const saveToast = document.getElementById('save-toast');

  let currentSettings = await loadSettings();

  /**
   * Render Accounts Table
   */
  function renderAccounts() {
    accountsTbody.innerHTML = '';
    const accounts = currentSettings.accounts || [];

    accounts.forEach((acc, i) => {
      const tr = document.createElement('tr');

      // Index column
      const tdIndex = document.createElement('td');
      const indexBadge = document.createElement('span');
      indexBadge.className = 'account-index-badge';
      indexBadge.textContent = `u/${acc.index}`;
      tdIndex.appendChild(indexBadge);
      tr.appendChild(tdIndex);

      // Label column (editable)
      const tdLabel = document.createElement('td');
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'input-field';
      labelInput.value = acc.label || '';
      labelInput.placeholder = `アカウント ${acc.index}`;
      labelInput.addEventListener('input', () => {
        acc.label = labelInput.value.trim();
      });
      tdLabel.appendChild(labelInput);
      tr.appendChild(tdLabel);

      // Default radio column
      const tdDefault = document.createElement('td');
      tdDefault.style.textAlign = 'center';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'default-account';
      radio.checked = acc.index === currentSettings.defaultAccountIndex;
      radio.addEventListener('change', () => {
        currentSettings.defaultAccountIndex = acc.index;
      });
      tdDefault.appendChild(radio);
      tr.appendChild(tdDefault);

      // Actions column
      const tdAction = document.createElement('td');
      if (accounts.length > 1) {
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn btn-danger btn-sm';
        btnDelete.textContent = '削除';
        btnDelete.addEventListener('click', () => {
          currentSettings.accounts = currentSettings.accounts.filter((_, idx) => idx !== i);
          if (currentSettings.defaultAccountIndex === acc.index) {
            currentSettings.defaultAccountIndex = currentSettings.accounts[0]?.index || 0;
          }
          renderAccounts();
        });
        tdAction.appendChild(btnDelete);
      } else {
        tdAction.textContent = '-';
      }
      tr.appendChild(tdAction);

      accountsTbody.appendChild(tr);
    });
  }

  /**
   * Render Templates Select Dropdown and Default Source Selectors
   */
  function renderTemplatesDropdown() {
    optTemplateSelect.innerHTML = '';
    optDefaultYtTemplate.innerHTML = '';
    optDefaultWebTemplate.innerHTML = '';

    const templates = currentSettings.promptTemplates || [];

    templates.forEach((t) => {
      // For main template editor dropdown
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.name;
      optTemplateSelect.appendChild(option);

      // For Video site default selector
      const ytOption = document.createElement('option');
      ytOption.value = t.id;
      ytOption.textContent = t.name;
      if (t.id === currentSettings.activeYtPromptId) {
        ytOption.selected = true;
      }
      optDefaultYtTemplate.appendChild(ytOption);

      // For Web information site default selector
      const webOption = document.createElement('option');
      webOption.value = t.id;
      webOption.textContent = t.name;
      if (t.id === currentSettings.activeWebPromptId) {
        webOption.selected = true;
      }
      optDefaultWebTemplate.appendChild(webOption);
    });

    if (templates.length > 0) {
      optTemplateSelect.value = templates[0].id;
      loadTemplateFields(templates[0].id);
    }
  }

  function loadTemplateFields(templateId) {
    const template = (currentSettings.promptTemplates || []).find((t) => t.id === templateId);
    if (template) {
      templateNameInput.value = template.name;
      templateContentInput.value = template.content;
    }
  }

  function saveCurrentTemplateFields() {
    const selectedId = optTemplateSelect.value;
    const template = (currentSettings.promptTemplates || []).find((t) => t.id === selectedId);
    if (template) {
      template.name = templateNameInput.value.trim() || '無題テンプレート';
      template.content = templateContentInput.value;
      const option = optTemplateSelect.querySelector(`option[value="${selectedId}"]`);
      if (option) option.textContent = template.name;
    }
  }

  // Event Listeners for Accounts
  btnAddAccount.addEventListener('click', () => {
    const index = parseInt(newAccIndexInput.value, 10);
    const label = newAccLabelInput.value.trim() || `アカウント ${index}`;

    if (isNaN(index) || index < 0) {
      alert('有効なアカウント番号（0以上の整数）を入力してください。');
      return;
    }

    if (currentSettings.accounts.some((a) => a.index === index)) {
      alert(`アカウント番号 ${index} は既に登録されています。`);
      return;
    }

    currentSettings.accounts.push({ index, label });
    currentSettings.accounts.sort((a, b) => a.index - b.index);
    newAccLabelInput.value = '';
    newAccIndexInput.value = (Math.max(...currentSettings.accounts.map((a) => a.index)) + 1);

    renderAccounts();
  });

  // Event Listeners for Templates
  optTemplateSelect.addEventListener('change', () => {
    loadTemplateFields(optTemplateSelect.value);
  });

  templateNameInput.addEventListener('input', () => {
    saveCurrentTemplateFields();
  });

  templateContentInput.addEventListener('input', () => {
    saveCurrentTemplateFields();
  });

  btnNewTemplate.addEventListener('click', () => {
    const newId = `custom_${Date.now()}`;
    const newTemplate = {
      id: newId,
      name: '新規プロンプトテンプレート',
      category: 'web',
      content: `以下の内容を要約してください。\n\n【タイトル】: {title}\n【URL】: {url}\n\n【本文（抜粋）】:\n{content}\n\n要約内容:`
    };
    currentSettings.promptTemplates.push(newTemplate);
    renderTemplatesDropdown();
    optTemplateSelect.value = newId;
    loadTemplateFields(newId);
  });

  btnDeleteTemplate.addEventListener('click', () => {
    if (currentSettings.promptTemplates.length <= 1) {
      alert('最低1つのテンプレートが必要です。');
      return;
    }
    const selectedId = optTemplateSelect.value;
    currentSettings.promptTemplates = currentSettings.promptTemplates.filter((t) => t.id !== selectedId);
    renderTemplatesDropdown();
  });

  btnResetTemplates.addEventListener('click', () => {
    if (confirm('すべてのプロンプトテンプレートをデフォルト状態に初期化しますか？')) {
      currentSettings.promptTemplates = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES));
      currentSettings.activeWebPromptId = 'web_standard';
      currentSettings.activeYtPromptId = 'yt_standard';
      renderTemplatesDropdown();
    }
  });

  // Source Default Selectors
  optDefaultYtTemplate.addEventListener('change', () => {
    currentSettings.activeYtPromptId = optDefaultYtTemplate.value;
  });

  optDefaultWebTemplate.addEventListener('change', () => {
    currentSettings.activeWebPromptId = optDefaultWebTemplate.value;
  });

  // Load General Settings
  optAutoSubmit.checked = currentSettings.autoSubmit ?? true;
  optShowButton.checked = currentSettings.showOnPageButton ?? true;
  optMaxChars.value = currentSettings.maxExtractChars || 12000;

  // Save Actions
  async function performSave() {
    saveCurrentTemplateFields();
    currentSettings.activeYtPromptId = optDefaultYtTemplate.value;
    currentSettings.activeWebPromptId = optDefaultWebTemplate.value;
    currentSettings.autoSubmit = optAutoSubmit.checked;
    currentSettings.showOnPageButton = optShowButton.checked;
    currentSettings.maxExtractChars = parseInt(optMaxChars.value, 10) || 12000;

    await saveSettings(currentSettings);

    saveToast.classList.add('show');
    setTimeout(() => {
      saveToast.classList.remove('show');
    }, 2500);
  }

  btnSaveTop.addEventListener('click', performSave);

  // Initialize UI
  renderAccounts();
  renderTemplatesDropdown();
});
