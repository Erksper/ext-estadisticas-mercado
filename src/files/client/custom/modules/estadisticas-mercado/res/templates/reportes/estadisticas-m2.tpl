<link rel="stylesheet" type="text/css" href="client/custom/modules/estadisticas-mercado/res/css/estilos.css">

<div class="em-page-header">
    <div class="em-header-icon">
        <i class="fas fa-chart-area"></i>
    </div>
    <div>
        <h2 class="em-page-title">Informe Estadístico de Mercado por m²</h2>
        <p class="em-page-sub">Análisis estadístico por urbanización: lados, precios, áreas y precio por m²</p>
    </div>
</div>

<!-- Filtros -->
<div class="em-filtros-card">
    <div class="em-filtros-titulo">
        <i class="fas fa-filter"></i> Filtros
    </div>

    <!-- Primera fila: Estado, Ciudad, Año(s), Mes(es) -->
    <div class="em-filtros-grid em-filtros-row-primario">

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Estado</label>
            <div id="em-filtro-estado-container"></div>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Ciudad</label>
            <div id="em-filtro-ciudad-container"></div>
        </div>

        <!-- PeriodoSelect inyecta aquí los dropdowns de Año(s) y Mes(es) -->
        <div id="em-periodo-container" style="display:contents;"></div>

    </div>

    <!-- Segunda fila: Tipo operación, tipo propiedad, subtipo -->
    <div class="em-filtros-grid em-filtros-row-secundario">

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Tipo Operación</label>
            <select id="em-filtro-tipo-operacion" class="em-filtro-select">
                <option value="">Todos</option>
                <option value="Venta">Venta</option>
                <option value="renta">Alquiler</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Tipo Propiedad</label>
            <select id="em-filtro-tipo-propiedad" class="em-filtro-select">
                <option value="">Todos</option>
                <option value="Comercial">Comercial</option>
                <option value="Habitacional">Residencial</option>
                <option value="Industrial">Industrial</option>
                <option value="Terreno">Terreno</option>
                <option value="Vacacional">Vacacional</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Subtipo Propiedad</label>
            <select id="em-filtro-subtipo" class="em-filtro-select">
                <option value="">Todos</option>
            </select>
        </div>

    </div>

    <div class="em-filtros-acciones">
        <button class="em-btn em-btn-primary" data-action="buscar">
            <i class="fas fa-search"></i> Buscar
        </button>
        <button class="em-btn em-btn-primary" data-action="limpiar">
            <i class="fas fa-times"></i> Limpiar
        </button>
    </div>
</div>

<!-- Cabecera con acciones -->
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