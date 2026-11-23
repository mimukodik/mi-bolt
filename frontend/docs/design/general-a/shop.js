(() => {
  const products = {
    arc: {
      name: 'Arc 5G',
      brand: 'Forma',
      price: 189990,
      screen: '6,4″ OLED',
      camera: '50 MP',
      battery: '4 800 mAh',
    },
    beam: {
      name: 'Beam 5G',
      brand: 'Fény',
      price: 139990,
      screen: '6,1″ OLED',
      camera: '48 MP',
      battery: '4 300 mAh',
    },
    orbit: {
      name: 'Orbit 5G',
      brand: 'Forma',
      price: 259990,
      screen: '6,7″ OLED',
      camera: '64 MP',
      battery: '5 100 mAh',
    },
  };
  const finishes = { graphite: 'Grafit', silver: 'Ezüst' };
  const capacities = { 128: 0, 256: 30000 };
  const money = new Intl.NumberFormat('hu-HU');
  const currency = (amount) => `${money.format(amount)} Ft`;
  const priceOf = (item) => products[item.model].price + capacities[item.capacity];
  const imageFor = (finish, side, model) => {
    if (side === 'front' && (model === 'beam' || model === 'orbit'))
      return `assets/${model}-front.webp`;
    return `assets/${finish}-${side}.webp`;
  };
  const params = new URLSearchParams(location.search);
  const originalCart = (params.get('kosar') || '')
    .split(',')
    .map((sku) => {
      const [model, finish, capacity, quantity] = sku.split('.');
      return { model, finish, capacity, quantity: Number(quantity) };
    })
    .filter(
      ({ model, finish, capacity, quantity }) =>
        Object.hasOwn(products, model) &&
        Object.hasOwn(finishes, finish) &&
        Object.hasOwn(capacities, capacity) &&
        Number.isInteger(quantity) &&
        quantity >= 1 &&
        quantity <= 5,
    );
  const cart = originalCart;
  const cartValue = () =>
    cart
      .map(({ model, finish, capacity, quantity }) => [model, finish, capacity, quantity].join('.'))
      .join(',');

  function reflectCart() {
    const value = cartValue();
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href');
      if (href.startsWith('#')) return;
      const target = new URL(href, location.href);
      if (value) target.searchParams.set('kosar', value);
      else target.searchParams.delete('kosar');
      anchor.href = target.href;
    });
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach((element) => {
      element.textContent = count ? `(${count})` : '';
    });
  }

  const filters = document.querySelector('[data-filters]');
  if (filters) {
    const cards = Array.from(document.querySelectorAll('[data-card]'));
    const results = document.querySelector('[data-results]');
    const sort = document.querySelector('[data-sort]');
    const count = document.querySelector('[data-result-count]');
    const empty = document.querySelector('[data-no-results]');
    const brand = filters.elements.marka;
    const finish = filters.elements.szin;
    const range = filters.elements.ar;
    for (const field of [brand, finish, range]) {
      const initial = params.get(field.name);
      if (Array.from(field.options).some((option) => option.value === initial))
        field.value = initial;
    }

    function filter() {
      const query = filters.elements.kereses.value.trim().toLocaleLowerCase('hu');
      let total = 0;
      const ordered = cards.slice();
      if (sort.value === 'asc')
        ordered.sort((a, b) => Number(a.dataset.price) - Number(b.dataset.price));
      if (sort.value === 'desc')
        ordered.sort((a, b) => Number(b.dataset.price) - Number(a.dataset.price));
      for (const card of ordered) {
        const price = Number(card.dataset.price);
        const priceMatch =
          !range.value ||
          (range.value === '150' && price < 150000) ||
          (range.value === '220' && price >= 150000 && price <= 220000) ||
          (range.value === 'plus' && price > 220000);
        const colors = card.dataset.finishes.split(' ');
        const visible =
          priceMatch &&
          (!brand.value || card.dataset.brand === brand.value) &&
          (!finish.value || colors.includes(finish.value)) &&
          card.dataset.title.toLocaleLowerCase('hu').includes(query);
        card.hidden = !visible;
        total += Number(visible);
        const link = card.querySelector('a');
        const url = new URL(link.href);
        if (finish.value && colors.includes(finish.value))
          url.searchParams.set('szin', finish.value);
        else url.searchParams.delete('szin');
        link.href = url.href;
        results.append(card);
      }
      document.querySelectorAll('[data-finish]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.finish === finish.value));
      });
      count.textContent = `${total} készülék`;
      empty.hidden = total !== 0;
    }
    document.querySelectorAll('[data-finish]').forEach((button) => {
      button.addEventListener('click', () => {
        finish.value = button.dataset.finish;
        filter();
      });
    });
    filters.elements.kereses.addEventListener('input', filter);
    filters.addEventListener('change', (event) => {
      if (event.target.matches('select')) filter();
    });
    filters.addEventListener('submit', (event) => event.preventDefault());
    filters.addEventListener('reset', () => requestAnimationFrame(filter));
    sort.addEventListener('change', filter);
    if (
      matchMedia('(min-width: 760px)').matches ||
      [brand, finish, range].some((field) => field.value)
    ) {
      filters.closest('details').open = true;
    }
    filter();
  }

  const order = document.querySelector('[data-product-order]');
  if (order) {
    const requestedModel = params.get('modell');
    const model = Object.hasOwn(products, requestedModel) ? requestedModel : 'arc';
    const product = products[model];
    const offeredFinish = { arc: ['graphite', 'silver'], beam: ['silver'], orbit: ['graphite'] }[
      model
    ];
    const color = order.elements.szin;
    const capacity = order.elements.tarhely;
    const gallery = document.querySelector('[data-gallery]');
    const galleryImage = gallery.querySelector('[data-gallery-image]');
    let side = galleryImage.dataset.side;
    document.title = `${product.name} · MiBolt`;
    for (const [key, value] of Object.entries(product)) {
      document.querySelectorAll(`[data-product="${key}"]`).forEach((element) => {
        element.textContent = value;
      });
    }
    for (const option of color) {
      option.disabled = !offeredFinish.includes(option.value);
      option.closest('label').hidden = option.disabled;
    }
    const previewFinish = params.get('szin');
    color.value = offeredFinish.includes(previewFinish) ? previewFinish : offeredFinish[0];

    function renderVariant() {
      const finish = color.value;
      galleryImage.src = imageFor(finish, side, model);
      galleryImage.alt = `${product.name}, ${finishes[finish].toLocaleLowerCase('hu')}, ${side === 'front' ? 'elölnézet' : 'hátulnézet'}`;
      gallery.querySelectorAll('button[data-side]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.side === side));
        button.querySelector('img').src = imageFor(finish, button.dataset.side, model);
      });
      order.querySelector('[data-variant-price]').textContent = currency(
        priceOf({ model, capacity: capacity.value }),
      );
    }
    gallery.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-side]');
      if (!button) return;
      side = button.dataset.side;
      renderVariant();
    });
    order.addEventListener('change', renderVariant);
    order.addEventListener('submit', (event) => {
      event.preventDefault();
      const item = cart.find(
        (line) =>
          line.model === model && line.finish === color.value && line.capacity === capacity.value,
      );
      if (item) item.quantity = Math.min(item.quantity + 1, 5);
      else cart.push({ model, finish: color.value, capacity: capacity.value, quantity: 1 });
      const url = new URL('cart.html', location.href);
      url.searchParams.set('kosar', cartValue());
      location.assign(url);
    });
    renderVariant();
  }

  const basket = document.querySelector('[data-basket]');
  if (basket) {
    const template = document.querySelector('#cart-line');
    const lines = basket.querySelector('[data-lines]');
    const empty = basket.querySelector('[data-empty-cart]');
    const summary = basket.querySelector('[data-summary]');
    const total = basket.querySelector('[data-total]');
    const subtotal = basket.querySelector('[data-subtotal]');

    function renderCart() {
      lines.replaceChildren();
      let sum = 0;
      cart.forEach((item, index) => {
        const product = products[item.model];
        const row = template.content.cloneNode(true);
        const image = row.querySelector('img');
        const price = priceOf(item) * item.quantity;
        const name = `${product.name}, ${finishes[item.finish]}, ${item.capacity} GB`;
        row.querySelector('[data-line]').dataset.line = index;
        image.src = imageFor(item.finish, 'back');
        row.querySelector('[data-line-name]').textContent = product.name;
        row.querySelector('[data-line-variant]').textContent =
          `${finishes[item.finish]} · ${item.capacity} GB`;
        row.querySelector('[data-line-price]').textContent = currency(price);
        const quantity = row.querySelector('select');
        quantity.value = item.quantity;
        quantity.setAttribute('aria-label', `Darabszám: ${name}`);
        row.querySelector('button').setAttribute('aria-label', `Eltávolítás: ${name}`);
        lines.append(row);
        sum += price;
      });
      empty.hidden = cart.length > 0;
      summary.hidden = cart.length === 0;
      total.textContent = currency(sum);
      subtotal.textContent = currency(sum);
      reflectCart();
    }

    function changeCart(control) {
      const index = Number(control.closest('[data-line]').dataset.line);
      if (control.tagName === 'SELECT') cart[index].quantity = Number(control.value);
      else cart.splice(index, 1);
      const url = new URL(location.href);
      if (cart.length) url.searchParams.set('kosar', cartValue());
      else url.searchParams.delete('kosar');
      // Some browsers restrict replaceState on file URLs. Links keep the cart usable there.
      try {
        history.replaceState(null, '', url);
      } catch (error) {
        if (error.name !== 'SecurityError') throw error;
      }
      renderCart();
      const nextControl = lines.children[Math.min(index, cart.length - 1)]?.querySelector('select');
      (nextControl || empty.querySelector('a')).focus();
    }

    lines.addEventListener('change', (event) => {
      if (event.target.matches('select')) changeCart(event.target);
    });
    lines.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) changeCart(button);
    });
    basket.querySelector('[data-checkout]').addEventListener('click', () => {
      document.querySelector('#checkout-demo').showModal();
    });
    renderCart();
  }
  reflectCart();
})();
