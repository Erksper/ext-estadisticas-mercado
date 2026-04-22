<link rel="stylesheet" type="text/css" href="client/custom/modules/estadisticas-mercado/res/css/estilos.css">

<div class="em-page-header">
    <div class="em-header-icon"><i class="fas fa-exchange-alt"></i></div>
    <div>
        <h2 class="em-page-title">Lado por Tipo de Operación</h2>
        <p class="em-page-sub">Conteo de lados por Venta / Alquiler agrupados por oficina · <em>Excluye Noviembre y Diciembre</em></p>
    </div>
</div>

<div class="em-filtros-card">
    <div class="em-filtros-titulo"><i class="fas fa-filter"></i> Filtros</div>
    <div class="em-filtros-grid">

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">CLA</label>
            <select id="em-filtro-cla" class="em-filtro-select">
                <option value="">Todos los CLAs</option>
            </select>
        </div>

        <!-- PeriodoSelect inyecta aquí los dropdowns de Año(s) y Mes(es) -->
        <div id="em-periodo-container" style="display:contents;"></div>

        <div class="em-filtros-acciones">
            <button class="em-btn em-btn-primary" data-action="buscar">
                <i class="fas fa-search"></i> Buscar
            </button>
            <button class="em-btn em-btn-primary" data-action="limpiar">
                <i class="fas fa-times"></i> Limpiar
            </button>
        </div>

    </div>
</div>

<div class="em-reporte-header">
    <h2><i class="fas fa-table" style="color:var(--color-primary);margin-right:8px;"></i>Resultados</h2>
    <div class="em-reporte-acciones">
        <button class="em-btn em-btn-primary" data-action="volver">
            <i class="fas fa-arrow-left"></i> Volver
        </button>
        <button class="em-btn em-btn-primary" data-action="exportar" disabled>
            <i class="fas fa-file-excel"></i> Exportar Excel
        </button>
    </div>
</div>

<div id="em-resultado-container">
    <div class="em-empty">
        <div class="em-empty-icon"><i class="fas fa-search"></i></div>
        <h4>Aplique los filtros para ver el reporte</h4>
        <p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p>
    </div>
</div>
