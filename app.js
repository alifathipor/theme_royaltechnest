import { createClient } from '@supabase/supabase-js';
import { createIcons, icons } from 'lucide';

// --- Config ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://uydazgfelieycdddidvd.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZGF6Z2ZlbGlleWNkZGRpZHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjM2MjUsImV4cCI6MjA4MDQ5OTYyNX0.lBYVjDm61wPrR9FG1CZIE-kYYK2mkWbEOA9oIGSk0ds';
const STORAGE_BUCKET = 'product-images';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase credentials missing! Check your .env file.');
}

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
  pmVideoContainer: $('pm-video-container'),
  pmVideo: $('pm-video'),
  pmTitle: $('pm-title'),
  pmSku: $('pm-sku'),
  pmDownload: $('pm-download'),
  pmDownloadVideo: $('pm-download-video'),
  
  loginModal: $('login-modal'),
  loginForm: $('login-form'),
  loginBtn: $('login-submit-btn'),
  
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
  prodVideo: $('prod-video'),
  filePreview: $('file-preview'),
  videoPreview: $('video-preview'),
  saveBtn: $('save-btn'),
  
  toast: $('toast'),
  toastMsg: $('toast-msg'),
  
  // Status
  statusDate: $('status-date'),
  statusDateMobile: $('status-date-mobile'),
  updateStatusBtn: $('update-status-btn'),
  updateStatusBtnMobile: $('update-status-btn-mobile')
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

  // Login Trigger
  $('admin-btn').addEventListener('click', () => {
    if (state.isAdmin) openAdmin();
    else els.loginModal.classList.remove('hidden');
  });

  // Login Submit
  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('username').value.trim();
    const p = $('password').value.trim();
    
    if (!u || !p) return showToast('لطفاً نام کاربری و رمز عبور را وارد کنید');

    const btn = els.loginBtn || els.loginForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'در حال بررسی...';

    try {
      const { data, error } = await supabase
        .from('app_admins')
        .select('*')
        .eq('username', u)
        .eq('password', p)
        .single();

      if (error || !data) {
        showToast('نام کاربری یا رمز عبور اشتباه است');
      } else {
        state.isAdmin = true;
        closeModals();
        openAdmin();
        showToast(`خوش آمدید ${data.username}`);
        $('username').value = '';
        $('password').value = '';
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('خطا در ارتباط با سرور');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // Admin Logout
  $('logout-btn').addEventListener('click', () => {
    state.isAdmin = false;
    els.adminPanel.classList.add('hidden');
    document.body.style.overflow = '';
    showToast('خروج موفقیت آمیز بود');
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

  // File Preview (Image)
  els.prodFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      els.filePreview.src = URL.createObjectURL(file);
      els.filePreview.classList.remove('hidden');
    }
  });

  // File Preview (Video)
  els.prodVideo.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      els.videoPreview.src = URL.createObjectURL(file);
      els.videoPreview.classList.remove('hidden');
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
  
  // Update Status
  els.updateStatusBtn.addEventListener('click', updateSystemStatus);
  els.updateStatusBtnMobile.addEventListener('click', updateSystemStatus);
}

// --- Helper: Normalize Persian/Arabic Digits ---
function toEnglishDigits(str) {
  if (!str) return str;
  return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// --- Helper: Build Query for Search ---
function applySearch(queryBuilder, searchTerm) {
  if (!searchTerm) return queryBuilder;
  
  // Normalize digits (e.g. ۱۲۳ -> 123)
  const normalizedTerm = toEnglishDigits(searchTerm);
  
  // Check if search term is numeric
  const isNumeric = /^\d+$/.test(normalizedTerm);
  
  if (isNumeric) {
    // If numeric, search in public_id (int) OR name (text)
    // IMPORTANT: We use the normalized (English) digits for the ID search
    return queryBuilder.or(`public_id.eq.${normalizedTerm},name.ilike.%${searchTerm}%`);
  } else {
    // If text (e.g. "ت"), ONLY search name. 
    // NEVER search UUID columns with text to avoid "invalid input syntax for type uuid"
    return queryBuilder.ilike('name', `%${searchTerm}%`);
  }
}

// --- Status Logic ---
async function fetchSystemStatus() {
  try {
    const { data, error } = await supabase
      .from('system_status')
      .select('updated_at')
      .eq('id', 1)
      .single();
      
    if (data) {
      renderStatus(data.updated_at);
    } else {
      // If no record exists, show a default message
      [els.statusDate, els.statusDateMobile].forEach(el => {
        el.textContent = 'هنوز ثبت نشده';
        el.className = 'status-date status-warning';
      });
    }
  } catch (err) {
    console.error('Error fetching status:', err);
  }
}

async function updateSystemStatus() {
  try {
    const now = new Date().toISOString();
    
    // Use upsert to create the row if it doesn't exist (id: 1)
    const { error } = await supabase
      .from('system_status')
      .upsert({ id: 1, updated_at: now });
      
    if (error) throw error;
    
    showToast('وضعیت سیستم بروزرسانی شد');
    renderStatus(now);
  } catch (err) {
    console.error('Error updating status:', err);
    showToast('خطا در بروزرسانی وضعیت');
  }
}

function renderStatus(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffTime = now - date; // Difference in milliseconds
  const diffDays = diffTime / (1000 * 60 * 60 * 24); 
  
  // Format: 1403/02/10 ساعت 12:30
  const options = { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    calendar: 'persian'
  };
  
  // Using 'fa-IR' locale for Persian date
  const formatted = date.toLocaleDateString('fa-IR', options).replace(',', ' ساعت');
  
  // Color Logic
  let colorClass = 'status-good'; // Default Green (< 3 days)
  
  if (diffDays > 6) {
    colorClass = 'status-critical'; // Red (> 6 days)
  } else if (diffDays > 3) {
    colorClass = 'status-warning'; // Orange (3-6 days)
  }
  
  // Update UI
  [els.statusDate, els.statusDateMobile].forEach(el => {
    el.textContent = formatted;
    // Reset classes and add the new one
    el.className = 'status-date';
    el.classList.add(colorClass);
  });
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
    query = applySearch(query, state.searchQuery);
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
  } else {
    console.error('Error fetching products:', error);
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
    // Use public_id for display. Fallback to '...' if not yet generated
    const displayId = p.public_id ? p.public_id : '...';
    
    div.innerHTML = `
      <div class="card-image-wrapper" onclick="window.openProduct('${p.id}')">
        <img src="${p.image_url || 'https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://placehold.co/400x300?text=No+Image'}" loading="lazy" alt="${p.name}">
        <div class="card-overlay">
          <button class="btn btn-primary btn-icon"><i data-lucide="eye"></i></button>
        </div>
      </div>
      <div class="card-content">
        <h3 class="card-title">${p.name}</h3>
        <div class="card-footer">
          <button class="copy-id-btn" onclick="window.copyId('${displayId}')">
            <i data-lucide="copy" style="width:14px"></i>
            <span>کد: ${displayId}</span>
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
  
  // Set Image
  els.pmImg.src = p.image_url || 'https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://placehold.co/400x300?text=No+Image';
  
  // Set Video
  if (p.video_url) {
    els.pmVideo.src = p.video_url;
    els.pmVideoContainer.classList.remove('hidden');
    
    // Setup Download Video Button
    els.pmDownloadVideo.href = p.video_url;
    els.pmDownloadVideo.classList.remove('hidden');
  } else {
    els.pmVideo.pause();
    els.pmVideo.src = "";
    els.pmVideoContainer.classList.add('hidden');
    els.pmDownloadVideo.href = "#";
    els.pmDownloadVideo.classList.add('hidden');
  }
  
  els.pmTitle.textContent = p.name;
  // Show only public_id, fallback to empty if missing
  els.pmSku.textContent = p.public_id || ''; 
  els.pmDownload.href = p.image_url || '#';
  els.productModal.classList.remove('hidden');
};

// --- Robust Copy Function ---
window.copyId = (text) => {
  if (!text || text === '...') return;
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('کد محصول کپی شد'))
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
      showToast('کد محصول کپی شد');
    } else {
      throw new Error('Copy failed');
    }
  } catch (err) {
    console.error('Fallback copy failed', err);
    showToast('خطا: لطفاً کد را دستی کپی کنید');
  }
}

window.copyModalSku = () => {
  window.copyId(els.pmSku.textContent);
};

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  // Pause video when closing
  if(els.pmVideo) els.pmVideo.pause();
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
  resetAdminTable();
  fetchAdminProducts();
  fetchSystemStatus(); // Fetch status when opening admin
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
    query = applySearch(query, state.adminSearchQuery);
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
      <td>
        <div style="display:flex; gap:4px;">
          <img src="${p.image_url || 'https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://img-wrapper.vercel.app/image?url=https://placehold.co/50?text=N/A'}" class="table-img">
          ${p.video_url ? '<div style="width:10px; height:10px; background:var(--accent); border-radius:50%;"></div>' : ''}
        </div>
      </td>
      <td>${p.name}</td>
      <td><span class="id-badge">${p.public_id || '...'}</span></td>
      <td>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-ghost btn-icon" style="width:32px;height:32px;" onclick="window.editItem('${p.id}')"><i data-lucide="edit-2" style="width:16px"></i></button>
          <button class="btn btn-ghost btn-icon" style="width:32px;height:32px;color:var(--danger)" onclick="window.deleteItem('${p.id}')"><i data-lucide="trash" style="width:16px"></i></button>
        </div>
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
  const videoFile = els.prodVideo.files[0];
  const name = els.prodName.value;
  
  if (!state.editingId && !file) {
    return showToast('لطفا یک تصویر انتخاب کنید');
  }

  state.isUploading = true;
  els.saveBtn.disabled = true;
  els.saveBtn.querySelector('.btn-text').textContent = 'در حال آپلود...';

  try {
    let imageUrl = els.filePreview.src;
    let videoUrl = state.editingId ? (state.adminProducts.find(p => p.id === state.editingId)?.video_url || null) : null;
    
    // Upload Image
    if (file) {
      const ext = file.name.split('.').pop();
      const fileName = `img-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file);
        
      if (upErr) throw upErr;
      
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);
        
      imageUrl = urlData.publicUrl;
    }

    // Upload Video
    if (videoFile) {
      const ext = videoFile.name.split('.').pop();
      const fileName = `vid-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, videoFile);
        
      if (upErr) throw upErr;
      
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);
        
      videoUrl = urlData.publicUrl;
    }

    const payload = { name, image_url: imageUrl, video_url: videoUrl };
    
    if (state.editingId) {
      const { error } = await supabase.from('products').update(payload).eq('id', state.editingId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('products').insert([payload]);
      if (error) throw error;
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
    showToast('خطا در ذخیره سازی: ' + err.message);
  } finally {
    state.isUploading = false;
    els.saveBtn.disabled = false;
    els.saveBtn.querySelector('.btn-text').textContent = 'ذخیره';
  }
}

window.editItem = async (id) => {
  let item = state.adminProducts.find(p => p.id === id);
  
  if (!item) {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    item = data;
  }
  
  if (item) {
    state.editingId = id;
    els.prodName.value = item.name;
    
    // Image Preview
    els.filePreview.src = item.image_url;
    els.filePreview.classList.remove('hidden');
    
    // Video Preview
    if (item.video_url) {
      els.videoPreview.src = item.video_url;
      els.videoPreview.classList.remove('hidden');
    } else {
      els.videoPreview.src = '';
      els.videoPreview.classList.add('hidden');
    }
    
    $('form-title').textContent = 'ویرایش محصول';
    els.formContainer.classList.remove('hidden');
    els.formContainer.scrollIntoView();
  }
};

window.deleteItem = async (id) => {
  if (confirm('آیا از حذف این محصول اطمینان دارید؟')) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      showToast('خطا در حذف محصول');
      console.error(error);
    } else {
      showToast('محصول حذف شد');
      resetAdminTable();
      fetchAdminProducts();
      resetGrid();
      fetchProducts();
    }
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
    const { error } = await supabase.from('products').delete().in('id', Array.from(state.selectedIds));
    
    if (error) {
      showToast('خطا در حذف گروهی');
    } else {
      showToast('محصولات انتخاب شده حذف شدند');
      state.selectedIds.clear();
      $('selected-count').textContent = '0';
      $('bulk-delete-btn').classList.add('hidden');
      resetAdminTable();
      fetchAdminProducts();
      resetGrid();
      fetchProducts();
    }
  }
}

function resetForm() {
  els.form.reset();
  state.editingId = null;
  els.filePreview.classList.add('hidden');
  els.filePreview.src = '';
  els.videoPreview.classList.add('hidden');
  els.videoPreview.src = '';
  $('form-title').textContent = 'افزودن محصول جدید';
}

function setupInfiniteScroll() {
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) fetchProducts();
  });
  if (els.sentinel) obs.observe(els.sentinel);
}

function setupAdminInfiniteScroll() {
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) fetchAdminProducts();
  }, { root: els.adminContent });
  if (els.adminSentinel) obs.observe(els.adminSentinel);
}

// Start
init();
