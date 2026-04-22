
define('estadisticas-mercado:views/modules/searchable-select', [], function () {

    // ── Constructor ────────────────────────────────────────────────────────────

    function SearchableSelect(container, opts) {
        this._container  = container;
        this._opts       = opts || {};
        this._items      = (opts.items || []).slice();
        this._value      = '';
        this._label      = '';
        this._open       = false;
        this._disabled   = false;
        this._filterText = '';

        this._render();
    }

    SearchableSelect.prototype = {

        // ── Render ────────────────────────────────────────────────────────────

        _render: function () {
            var self = this;

            var wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;width:100%;';

            // Input visible al usuario
            var input = document.createElement('input');
            input.type        = 'text';
            input.className   = 'em-filtro-select';
            input.style.cssText =
                'width:100%;box-sizing:border-box;cursor:pointer;' +
                'padding-right:28px;' +
                'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'' +
                ' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E");' +
                'background-repeat:no-repeat;background-position:calc(100% - 10px) center;';
            input.placeholder = this._opts.placeholder || 'Seleccione o escriba…';
            input.autocomplete = 'off';
            input.spellcheck   = false;

            // Lista desplegable
            var list = document.createElement('div');
            list.style.cssText =
                'display:none;position:absolute;top:calc(100% + 4px);left:0;' +
                'width:100%;max-height:240px;overflow-y:auto;' +
                'background:#fff;border:2px solid var(--color-primary);' +
                'border-radius:var(--radius-lg);box-shadow:var(--shadow-hover);' +
                'z-index:9999;';

            wrap.appendChild(input);
            wrap.appendChild(list);

            this._container.innerHTML = '';
            this._container.appendChild(wrap);
            this._wrap  = wrap;
            this._input = input;
            this._list  = list;

            // ── Eventos ───────────────────────────────────────────────────────

            // Abrir al hacer foco
            input.addEventListener('focus', function () {
                if (self._disabled) return;
                self._filterText = '';
                input.value = '';
                self._renderList();
                self._open = true;
                list.style.display = 'block';
            });

            // Filtrar al escribir
            input.addEventListener('input', function () {
                if (self._disabled) return;
                self._filterText = input.value.toLowerCase().trim();
                self._renderList();
                list.style.display = 'block';
                self._open = true;
            });

            // Cerrar con Escape
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { self._close(); }
            });

            // Cerrar al clic fuera
            document.addEventListener('click', function (e) {
                if (!wrap.contains(e.target)) { self._close(); }
            });

            this._renderList();
        },

        // ── Render de la lista de opciones ────────────────────────────────────

        _renderList: function () {
            var self   = this;
            var list   = this._list;
            var filter = this._filterText;
            list.innerHTML = '';

            // Opción vacía / "Todos"
            var emptyLabel = this._opts.emptyLabel || 'Todos';
            list.appendChild(this._crearItem('', emptyLabel, true));

            var count = 0;
            this._items.forEach(function (item) {
                var label = item.label || item.value || '';
                if (filter && label.toLowerCase().indexOf(filter) === -1) return;
                list.appendChild(self._crearItem(item.value, label, false));
                count++;
            });

            // Sin resultados
            if (count === 0 && filter) {
                var noRes = document.createElement('div');
                noRes.style.cssText =
                    'padding:10px 14px;font-size:13px;color:#999;font-style:italic;';
                noRes.textContent = 'Sin resultados para "' + filter + '"';
                list.appendChild(noRes);
            }
        },

        _crearItem: function (value, label, esVacio) {
            var self = this;
            var div  = document.createElement('div');
            div.style.cssText =
                'padding:8px 14px;cursor:pointer;font-size:13px;' +
                'transition:background 0.15s;user-select:none;';

            if (esVacio) {
                div.style.fontWeight   = '700';
                div.style.color        = 'var(--color-primary)';
                div.style.borderBottom = '1px solid var(--color-gray-light)';
            }

            // Resaltar el ítem seleccionado actualmente
            if (value === this._value) {
                div.style.background  = 'rgba(184,162,121,0.12)';
                div.style.fontWeight  = '600';
            }

            div.textContent = label;

            div.addEventListener('mouseenter', function () {
                div.style.background = 'rgba(184,162,121,0.1)';
            });
            div.addEventListener('mouseleave', function () {
                div.style.background =
                    (value === self._value) ? 'rgba(184,162,121,0.12)' : '';
            });

            div.addEventListener('click', function (e) {
                e.stopPropagation();
                self._select(value, label);
            });

            return div;
        },

        // ── Selección ─────────────────────────────────────────────────────────

        _select: function (value, label) {
            this._value = value;
            this._label = label;

            var emptyLabel = this._opts.emptyLabel || 'Todos';
            this._input.value       = value ? label : '';
            this._input.placeholder = value ? '' : (this._opts.placeholder || emptyLabel);

            this._close();

            if (typeof this._opts.onChange === 'function') {
                this._opts.onChange(value, label);
            }
        },

        _close: function () {
            this._open       = false;
            this._filterText = '';
            this._list.style.display = 'none';

            // Restaurar el texto del ítem seleccionado
            if (this._value) {
                this._input.value = this._label || this._value;
            } else {
                this._input.value = '';
            }
        },

        // ── API pública ───────────────────────────────────────────────────────

        getValue: function () { return this._value; },

        setValue: function (value) {
            var found = null;
            for (var i = 0; i < this._items.length; i++) {
                if (this._items[i].value === value) { found = this._items[i]; break; }
            }
            var label = found ? found.label : value;
            this._select(value, label);
        },

        setItems: function (items) {
            this._items      = (items || []).slice();
            this._value      = '';
            this._label      = '';
            this._input.value = '';
            this._filterText = '';
            this._renderList();
        },

        reset: function () {
            var emptyLabel = this._opts.emptyLabel || 'Todos';
            this._select('', emptyLabel);
        },

        disable: function () {
            this._disabled          = true;
            this._input.disabled    = true;
            this._input.style.background  = '#f0f0f0';
            this._input.style.color       = '#aaa';
            this._input.style.cursor      = 'not-allowed';
            this._close();
        },

        enable: function () {
            this._disabled          = false;
            this._input.disabled    = false;
            this._input.style.background  = '';
            this._input.style.color       = '';
            this._input.style.cursor      = 'pointer';
        }
    };

    return SearchableSelect;
});