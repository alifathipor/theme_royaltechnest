import { createClient } from '@supabase/supabase-js';
import { createIcons, icons } from 'lucide';

// --- Config ---
const SUPABASE_URL = 'https://uydazgfelieycdddidvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZGF6Z2ZlbGlleWNkZGRpZHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjM2MjUsImV4cCI6MjA4MDQ5OTYyNX0.lBYVjDm61wPrR9FG1CZIE-kYYK2mkWbEOA9oIGSk0ds';
const STORAGE_BUCKET = 'product-images';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- State ---
const state = {
  // Public
  products: [],
  page: 0,
  hasMore: true,
  isLoading: false,
  searchQuery: '',
  
  // Admin
  isAdmin: false,
  adminProducts: [],
  adminPage: 0,
  adminHasMore: true,
  adminIsLoading: false,
  adminSearchQuery: '',
  selectedIds: new Set(),
  editingId: null,
  isUploading: false
};

const PAGE_SIZE = 20;

// --- Elements ---
const $ = (id) => document.getElementById(id);
const els = {
  grid: $('product-grid'),
  sentinel: $('loading-sentinel'),
  empty: $('empty-state'),
  search: $('search-input'),
  
  // Modals
  productModal: $('product-modal'),
  pmImg: $('pm-img'),
  pmTitle: $('pm-title'),
  pmSku: $('pm-sku'),
  pmDownload: $('pm-download'),
  
  loginModal: $('login-modal'),
  loginForm: $('login-form'),
  
  // Admin
  adminPanel: $('admin-panel'),
  adminContent: $('admin-content-scroll'),
  adminTable: $('admin-table-body'),
  adminSentinel: $('admin-sentinel'),
  adminEmpty: $('admin-empty'),
  adminSearch: $('admin-search-input'),
  
  formContainer: $('product-form-container'),
  form: $('product-form'),
  prodName: $('prod-name'),
  prodFile: $('prod-file'),
  filePreview: $('file-preview'),
  saveBtn: $('save-btn'),
  
  toast: $('toast'),
  toastMsg: $('toast-msg')
};

// --- Init ---
function init() {
  createIcons({ icons });
  setupEvents();
  fetchProducts();
  setupInfiniteScroll();
  setupAdminInfiniteScroll();
}

// --- Events ---
function setupEvents() {
  // Public Search Debounce
  let timeout;
  els.search.addEventListener('input', (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      resetGrid();
      fetchProducts();
    }, 500);
  });

  // Modals
  document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', closeModals);
  });
  document.addEventListener('keydown', e => e.key === 'Escape' && closeModals());

  // Login
  $('admin-btn').addEventListener('click', () => {
    if (state.isAdmin) openAdmin();
    else els.loginModal.classList.remove('hidden');
  });

  els.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('username').value;
    const p = $('password').value;
    if (u === 'admin' && p === 'Aa@123456') {
      state.isAdmin = true;
      closeModals();
      openAdmin();
      showToast('خوش آمدید مدیر عزیز');
    } else {
      showToast('نام کاربری یا رمز عبور اشتباه است');
    }
  });

  // Admin
  $('logout-btn').addEventListener('click', () => {
    state.isAdmin = false;
    els.adminPanel.classList.add('hidden');
    document.body.style.overflow = '';
  });

  // Admin Search
  let adminTimeout;
  els.adminSearch.addEventListener('input', (e) => {
    clearTimeout(adminTimeout);
    adminTimeout = setTimeout(() => {
      state.adminSearchQuery = e.target.value.trim();
      resetAdminTable();
      fetchAdminProducts();
    }, 500);
  });

  $('add-product-btn').addEventListener('click', () => {
    resetForm();
    els.formContainer.classList.remove('hidden');
    els.formContainer.scrollIntoView({ behavior: 'smooth' });
  });

  $('cancel-form-btn').addEventListener('click', () => {
    els.formContainer.classList.add('hidden');
  });

  // File Preview
  els.prodFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      els.filePreview.src = URL.createObjectURL(file);
      els.filePreview.classList.remove('hidden');
    }
  });

  els.form.addEventListener('submit', handleSave);
  
  // Bulk Actions
  $('select-all').addEventListener('change', (e) => {
    document.querySelectorAll('.row-check').forEach(c => {
      c.checked = e.target.checked;
      toggleSelect(c.value, c.checked);
    });
  });
  
  $('bulk-delete-btn').addEventListener('click', deleteBulk);
}

// --- Public Logic ---
async function fetchProducts() {
  if (state.isLoading || !state.hasMore) return;
  state.isLoading = true;
  els.sentinel.style.display = 'block';

  let query = supabase
    .from('products')
    .select('*')
    .range(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE - 1)
    .order('created_at', { ascending: false });

  if (state.searchQuery) {
    query = query.or(`name.ilike.%${state.searchQuery}%,id.eq.${state.searchQuery}`);
  }

  const { data, error } = await query;

  if (!error) {
    if (data.length < PAGE_SIZE) {
      state.hasMore = false;
      els.sentinel.style.display = 'none';
    }
    state.products = [...state.products, ...data];
    renderGrid(data);
    state.page++;
    els.empty.classList.toggle('hidden', state.products.length > 0);
  }
  state.isLoading = false;
}

function resetGrid() {
  state.products = [];
  state.page = 0;
  state.hasMore = true;
  els.grid.innerHTML = '';
  els.empty.classList.add('hidden');
  els.sentinel.style.display = 'block';
}

function renderGrid(items) {
  const frag = document.createDocumentFragment();
  items.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product-card';
    div.innerHTML = `
      <div class="card-image-wrapper" onclick="window.openProduct('${p.id}')">
        <img src="${p.image_url}" loading="lazy" alt="${p.name}">
        <div class="card-overlay">
          <button class="btn btn-primary btn-icon"><i data-lucide="eye"></i></button>
        </div>
      </div>
      <div class="card-content">
        <h3 class="card-title">${p.name}</h3>
        <div class="card-footer">
          <button class="copy-id-btn" onclick="window.copyId('${p.id}')">
            <i data-lucide="copy" style="width:14px"></i>
            <span>کپی شناسه</span>
          </button>
        </div>
      </div>
    `;
    frag.appendChild(div);
  });
  els.grid.appendChild(frag);
  createIcons({ icons, nameAttr: 'data-lucide' });
}

// --- Global Actions ---
window.openProduct = (id) => {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  els.pmImg.src = p.image_url;
  els.pmTitle.textContent = p.name;
  els.pmSku.textContent = p.id;
  els.pmDownload.href = p.image_url;
  els.productModal.classList.remove('hidden');
};

// --- Robust Copy Function (Fixed) ---
window.copyId = (text) => {
  if (!text) return;
  
  // Try Modern API first, but catch errors immediately
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('شناسه محصول کپی شد'))
      .catch((err) => {
        console.warn('Clipboard API failed, using fallback', err);
        fallbackCopy(text);
      });
  } else {
    fallbackCopy(text);
  }
};

function fallbackCopy(text) {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure it's part of the DOM but invisible
    textArea.style.position = "fixed";
    textArea.style.left = "0";
    textArea.style.top = "0";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      showToast('شناسه محصول کپی شد');
    } else {
      throw new Error('Copy failed');
    }
  } catch (err) {
    console.error('Fallback copy failed', err);
    showToast('خطا: لطفاً شناسه را دستی کپی کنید');
  }
}

window.copyModalSku = () => {
  window.copyId(els.pmSku.textContent);
};

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function showToast(msg) {
  els.toastMsg.textContent = msg;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 3000);
}

// --- Admin Logic ---
function openAdmin() {
  els.adminPanel.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (state.adminProducts.length === 0) {
    fetchAdminProducts();
  }
}

async function fetchAdminProducts() {
  if (state.adminIsLoading || !state.adminHasMore) return;
  state.adminIsLoading = true;
  els.adminSentinel.style.display = 'block';

  let query = supabase
    .from('products')
    .select('*')
    .range(state.adminPage * PAGE_SIZE, (state.adminPage + 1) * PAGE_SIZE - 1)
    .order('created_at', { ascending: false });

  if (state.adminSearchQuery) {
    // Search by ID or Name
    query = query.or(`name.ilike.%${state.adminSearchQuery}%,id.eq.${state.adminSearchQuery}`);
  }

  const { data, error } = await query;

  if (!error) {
    if (data.length < PAGE_SIZE) {
      state.adminHasMore = false;
      els.adminSentinel.style.display = 'none';
    }
    state.adminProducts = [...state.adminProducts, ...data];
    renderAdminTable(data);
    state.adminPage++;
    els.adminEmpty.classList.toggle('hidden', state.adminProducts.length > 0);
  }
  state.adminIsLoading = false;
}

function resetAdminTable() {
  state.adminProducts = [];
  state.adminPage = 0;
  state.adminHasMore = true;
  els.adminTable.innerHTML = '';
  els.adminEmpty.classList.add('hidden');
  els.adminSentinel.style.display = 'block';
}

function renderAdminTable(items) {
  const html = items.map(p => `
    <tr>
      <td><input type="checkbox" class="row-check" value="${p.id}" onchange="window.toggleSelect('${p.id}', this.checked)"></td>
      <td><img src="${p.image_url}" class="table-img"></td>
      <td>${p.name}</td>
      <td><span class="id-badge">${p.id}</span></td>
      <td>
        <button class="btn btn-ghost btn-icon" style="width:32px;height:32px;" onclick="window.editItem('${p.id}')"><i data-lucide="edit-2" style="width:16px"></i></button>
        <button class="btn btn-ghost btn-icon" style="width:32px;height:32px;color:var(--danger)" onclick="window.deleteItem('${p.id}')"><i data-lucide="trash" style="width:16px"></i></button>
      </td>
    </tr>
  `).join('');
  
  els.adminTable.insertAdjacentHTML('beforeend', html);
  createIcons({ icons, nameAttr: 'data-lucide' });
}

async function handleSave(e) {
  e.preventDefault();
  if (state.isUploading) return;
  
  const file = els.prodFile.files[0];
  const name = els.prodName.value;
  
  if (!state.editingId && !file) {
    return showToast('لطفا یک تصویر انتخاب کنید');
  }

  state.isUploading = true;
  els.saveBtn.disabled = true;
  els.saveBtn.querySelector('.btn-text').textContent = 'در حال ذخیره...';

  try {
    let imageUrl = els.filePreview.src;
    
    // Upload if new file
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file);
      if (upErr) throw upErr;
      
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      imageUrl = data.publicUrl;
    }

    const payload = { name, image_url: imageUrl };
    
    if (state.editingId) {
      await supabase.from('products').update(payload).eq('id', state.editingId);
    } else {
      await supabase.from('products').insert([payload]);
    }

    showToast('محصول با موفقیت ذخیره شد');
    els.formContainer.classList.add('hidden');
    
    // Refresh both lists
    resetAdminTable();
    fetchAdminProducts();
    resetGrid();
    fetchProducts();
    
  } catch (err) {
    console.error(err);
    showToast('خطا در ذخیره سازی');
  } finally {
    state.isUploading = false;
    els.saveBtn.disabled = false;
    els.saveBtn.querySelector('.btn-text').textContent = 'ذخیره';
  }
}

window.editItem = async (id) => {
  // Try to find in local state first
  let item = state.adminProducts.find(p => p.id === id);
  
  // If not found (rare), fetch it
  if (!item) {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    item = data;
  }
  
  if (item) {
    state.editingId = id;
    els.prodName.value = item.name;
    els.filePreview.src = item.image_url;
    els.filePreview.classList.remove('hidden');
    $('form-title').textContent = 'ویرایش محصول';
    els.formContainer.classList.remove('hidden');
    els.formContainer.scrollIntoView();
  }
};

window.deleteItem = async (id) => {
  if (confirm('آیا از حذف این محصول اطمینان دارید؟')) {
    await supabase.from('products').delete().eq('id', id);
    resetAdminTable();
    fetchAdminProducts();
    resetGrid();
    fetchProducts();
  }
};

window.toggleSelect = (id, checked) => {
  if (checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  
  const count = state.selectedIds.size;
  $('selected-count').textContent = count;
  $('bulk-delete-btn').classList.toggle('hidden', count === 0);
};

async function deleteBulk() {
  if (confirm(`حذف ${state.selectedIds.size} محصول؟`)) {
    await supabase.from('products').delete().in('id', Array.from(state.selectedIds));
    state.selectedIds.clear();
    resetAdminTable();
    fetchAdminProducts();
    resetGrid();
    fetchProducts();
  }
}

function resetForm() {
  els.form.reset();
  state.editingId = null;
  els.filePreview.classList.add('hidden');
  els.filePreview.src = '';
  $('form-title').textContent = 'افزودن محصول جدید';
}

function setupInfiniteScroll() {
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) fetchProducts();
  });
  obs.observe(els.sentinel);
}

function setupAdminInfiniteScroll() {
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) fetchAdminProducts();
  }, { root: els.adminContent });
  obs.observe(els.adminSentinel);
}

init();
