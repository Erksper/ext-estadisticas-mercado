
define('estadisticas-mercado:views/modules/periodo-select', [], function () {

    var MESES_NOMBRES = [
        '',
        'Enero','Febrero','Marzo','Abril','Mayo','Junio',
        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ];

    // ── Constructor ────────────────────────────────────────────────────────────

    function PeriodoSelect(container, opts) {
        this._container     = container;
        this._opts          = opts || {};
        this._blockedMonths = opts.blockedMonths || [];
        this._aniosDisp     = [];
        this._aniosSel      = [];   // vacío = todos
        this._mesesSel      = [];   // vacío = todos
        this._openAnios     = false;
        this._openMeses     = false;

        this._render();
        this._loadAnios();
    }

    PeriodoSelect.prototype = {

        // ── Render inicial ────────────────────────────────────────────────────

        _render: function () {
            var self = this;

            // Usamos display:contents para que los hijos participen en el flex
            // del contenedor padre (.em-filtros-grid)
            this._container.style.cssText = 'display:contents;';

            // ── Bloque Años ───────────────────────────────────────────────────
            var gAnio = this._crearGrupo('Año(s)', true);
            this._container.appendChild(gAnio.grupo);
            this._btnAnios  = gAnio.btn;
            this._listAnios = gAnio.list;

            // ── Bloque Meses ──────────────────────────────────────────────────
            var gMes = this._crearGrupo('Mes(es)', false);
            this._container.appendChild(gMes.grupo);
            this._btnMeses  = gMes.btn;
            this._listMeses = gMes.list;

            // Poblar meses (estático)
            this._renderMeses();

            // ── Cierre al sacar el mouse (vigilamos ambos grupos) ─────────────
            var grupos        = [gAnio.grupo, gMes.grupo];
            var mouseEnWidget = false;

            grupos.forEach(function (g) {
                g.addEventListener('mouseenter', function () { mouseEnWidget = true; });
                g.addEventListener('mouseleave', function () {
                    mouseEnWidget = false;
                    setTimeout(function () {
                        if (!mouseEnWidget) { self._closeAll(); }
                    }, 80);
                });
            });

            // Cerrar al clic fuera
            document.addEventListener('click', function (e) {
                if (!gAnio.grupo.contains(e.target) && !gMes.grupo.contains(e.target)) {
                    self._closeAll();
                }
            });
        },

        // ── Crea un grupo label + botón + lista ───────────────────────────────

        _crearGrupo: function (labelTxt, esAnios) {
            var self  = this;
            var grupo = document.createElement('div');
            grupo.className = 'em-filtro-grupo';
            grupo.style.cssText = 'position:relative;min-width:160px;flex:1;';

            var label = document.createElement('label');
            label.className = 'em-filtro-label';
            label.textContent = labelTxt;

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'em-filtro-select';
            btn.style.cssText =
                'text-align:left;cursor:pointer;display:flex;' +
                'justify-content:space-between;align-items:center;' +
                'width:100%;box-sizing:border-box;background:#fff;border:2px solid var(--color-gray-light);' +
                'border-radius:var(--radius-lg);padding:9px 12px;font-size:13px;' +
                'color:var(--color-dark);transition:border-color var(--transition);';
            btn.innerHTML =
                '<span class="ps-label">Todos los ' + labelTxt + '</span>' +
                '<i class="fas fa-chevron-down" style="font-size:10px;color:#999;margin-left:6px;flex-shrink:0;"></i>';

            var list = document.createElement('div');
            list.className = 'ps-list';
            list.style.cssText =
                'display:none;position:absolute;top:calc(100% + 4px);left:0;' +
                'min-width:190px;max-height:260px;overflow-y:auto;' +
                'background:#fff;border:2px solid var(--color-primary);' +
                'border-radius:var(--radius-lg);box-shadow:var(--shadow-hover);' +
                'z-index:9999;padding:4px 0;';

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (esAnios) {
                    self._openAnios = !self._openAnios;
                    self._openMeses = false;
                } else {
                    self._openMeses = !self._openMeses;
                    self._openAnios = false;
                }
                self._syncVisibility();
            });

            grupo.appendChild(label);
            grupo.appendChild(btn);
            grupo.appendChild(list);

            return { grupo: grupo, btn: btn, list: list };
        },

        // ── Visibilidad ───────────────────────────────────────────────────────

        _syncVisibility: function () {
            this._listAnios.style.display = this._openAnios ? 'block' : 'none';
            this._listMeses.style.display = this._openMeses ? 'block' : 'none';
        },

        _closeAll: function () {
            this._openAnios = false;
            this._openMeses = false;
            this._syncVisibility();
        },

        // ── Carga y render de años ────────────────────────────────────────────

        _loadAnios: function () {
            var self = this;
            if (typeof this._opts.getAnios === 'function') {
                this._opts.getAnios(function (anios) {
                    self._aniosDisp = anios || [];
                    self._aniosSel  = [];
                    self._renderAnios();
                });
            }
        },

        _renderAnios: function () {
            var self = this;
            var list = this._listAnios;
            list.innerHTML = '';

            list.appendChild(this._crearItemTodos('anio'));

            this._aniosDisp.forEach(function (anio) {
                list.appendChild(self._crearItem(String(anio), String(anio), 'anio'));
            });

            this._syncCheckboxes(list, this._aniosSel);
            this._updateBtnLabel(this._btnAnios, this._aniosSel, 'Años');
        },

        // ── Render de meses (estático) ────────────────────────────────────────

        _renderMeses: function () {
            var self = this;
            var list = this._listMeses;
            list.innerHTML = '';

            list.appendChild(this._crearItemTodos('mes'));

            for (var m = 1; m <= 12; m++) {
                if (this._blockedMonths.indexOf(m) !== -1) continue;
                list.appendChild(self._crearItem(String(m), MESES_NOMBRES[m], 'mes'));
            }

            this._syncCheckboxes(list, this._mesesSel);
            this._updateBtnLabel(this._btnMeses, this._mesesSel, 'Meses');
        },

        // ── Ítem "Todos" ──────────────────────────────────────────────────────

        _crearItemTodos: function (tipo) {
            var self = this;
            var div  = document.createElement('div');
            div.style.cssText =
                'padding:8px 14px;cursor:pointer;font-size:13px;font-weight:700;' +
                'color:var(--color-primary);border-bottom:1px solid var(--color-gray-light);' +
                'transition:background 0.15s;user-select:none;';
            div.textContent = 'Todos';

            div.addEventListener('mouseenter', function () { div.style.background = 'rgba(184,162,121,0.1)'; });
            div.addEventListener('mouseleave', function () { div.style.background = ''; });
            div.addEventListener('click', function (e) {
                e.stopPropagation();
                if (tipo === 'anio') {
                    self._aniosSel = [];
                    self._syncCheckboxes(self._listAnios, []);
                    self._updateBtnLabel(self._btnAnios, [], 'Años');
                } else {
                    self._mesesSel = [];
                    self._syncCheckboxes(self._listMeses, []);
                    self._updateBtnLabel(self._btnMeses, [], 'Meses');
                }
                self._notify();
            });
            return div;
        },

        // ── Ítem individual ───────────────────────────────────────────────────

        _crearItem: function (valor, texto, tipo) {
            var self = this;
            var div  = document.createElement('div');
            div.dataset.valor = valor;
            div.dataset.tipo  = tipo;
            div.style.cssText =
                'padding:7px 14px;cursor:pointer;font-size:13px;' +
                'display:flex;align-items:center;gap:8px;' +
                'transition:background 0.15s;user-select:none;';

            var chk = document.createElement('span');
            chk.className = 'ps-chk';
            chk.style.cssText =
                'width:15px;height:15px;border:2px solid var(--color-gray-light);' +
                'border-radius:3px;display:inline-flex;align-items:center;' +
                'justify-content:center;flex-shrink:0;transition:all 0.15s;';

            var lbl = document.createElement('span');
            lbl.textContent = texto;

            div.appendChild(chk);
            div.appendChild(lbl);

            div.addEventListener('mouseenter', function () { div.style.background = 'rgba(184,162,121,0.08)'; });
            div.addEventListener('mouseleave', function () { div.style.background = ''; });

            div.addEventListener('click', function (e) {
                e.stopPropagation();
                var v = parseInt(valor, 10);
                if (tipo === 'anio') {
                    self._toggle(self._aniosSel, v);
                    self._syncCheckboxes(self._listAnios, self._aniosSel);
                    self._updateBtnLabel(self._btnAnios, self._aniosSel, 'Años');
                } else {
                    self._toggle(self._mesesSel, v);
                    self._syncCheckboxes(self._listMeses, self._mesesSel);
                    self._updateBtnLabel(self._btnMeses, self._mesesSel, 'Meses');
                }
                self._notify();
            });

            return div;
        },

        // ── Helpers internos ──────────────────────────────────────────────────

        _toggle: function (arr, val) {
            var idx = arr.indexOf(val);
            if (idx === -1) {
                arr.push(val);
                arr.sort(function (a, b) { return a - b; });
            } else {
                arr.splice(idx, 1);
            }
        },

        // Actualiza el estado visual de los checkboxes.
        // selArr vacío → todos marcados (estado "Todos")
        _syncCheckboxes: function (list, selArr) {
            var items = list.querySelectorAll('[data-valor]');
            items.forEach(function (item) {
                var chk    = item.querySelector('.ps-chk');
                if (!chk) return;
                var val    = parseInt(item.dataset.valor, 10);
                var activo = selArr.length === 0 || selArr.indexOf(val) !== -1;
                if (activo) {
                    chk.style.background  = 'var(--color-primary)';
                    chk.style.borderColor = 'var(--color-primary)';
                    chk.innerHTML = '<i class="fas fa-check" style="font-size:9px;color:#fff;"></i>';
                } else {
                    chk.style.background  = '';
                    chk.style.borderColor = 'var(--color-gray-light)';
                    chk.innerHTML = '';
                }
            });
        },

        _updateBtnLabel: function (btn, selArr, nombre) {
            var span = btn.querySelector('.ps-label');
            if (!span) return;
            if (!selArr || selArr.length === 0) {
                span.textContent = 'Todos los ' + nombre;
            } else if (selArr.length === 1) {
                var v = selArr[0];
                span.textContent = (nombre === 'Meses') ? (MESES_NOMBRES[v] || String(v)) : String(v);
            } else {
                span.textContent = selArr.length + ' ' + nombre + ' selec.';
            }
        },

        _notify: function () {
            if (typeof this._opts.onAnyChange === 'function') {
                this._opts.onAnyChange(
                    this._aniosSel.slice(),
                    this._mesesSel.slice()
                );
            }
        },

        // ── API pública ───────────────────────────────────────────────────────

        getAniosSeleccionados: function () { return this._aniosSel.slice(); },
        getMesesSeleccionados: function () { return this._mesesSel.slice(); },

        reset: function () {
            this._aniosSel = [];
            this._mesesSel = [];
            this._syncCheckboxes(this._listAnios, []);
            this._syncCheckboxes(this._listMeses, []);
            this._updateBtnLabel(this._btnAnios, [], 'Años');
            this._updateBtnLabel(this._btnMeses, [], 'Meses');
        },

        reloadAnios: function () {
            this._loadAnios();
        }
    };

    return PeriodoSelect;
});