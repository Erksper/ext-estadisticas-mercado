<link rel="stylesheet" type="text/css" href="client/custom/modules/estadisticas-mercado/res/css/estilos.css">

<div class="em-page-header">
    <div class="em-header-icon">
        <i class="fas fa-chart-line"></i>
    </div>
    <div>
        <h2 class="em-page-title">Rango de Precios</h2>
        <p class="em-page-sub">Distribución de propiedades por rango de precio, según subtipo de propiedad</p>
    </div>
</div>

<!-- Filtros -->
<div class="em-filtros-card">
    <div class="em-filtros-titulo">
        <i class="fas fa-filter"></i> Filtros
    </div>

    <!-- Primera fila: CLA, Oficina, Fechas -->
    <div class="em-filtros-grid em-filtros-row-primario">
        <div class="em-filtro-grupo">
            <label class="em-filtro-label">CLA</label>
            <select id="em-filtro-cla" class="em-filtro-select">
                <option value="">Todos los CLAs</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Oficina</label>
            <select id="em-filtro-oficina" class="em-filtro-select" disabled>
                <option value="">Todas las oficinas</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Fecha Inicio</label>
            <input type="date" id="em-filtro-fecha-inicio" class="em-filtro-select">
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Fecha Fin</label>
            <input type="date" id="em-filtro-fecha-fin" class="em-filtro-select">
        </div>
    </div>

    <!-- Segunda fila: Tipo Operación, Tipo Propiedad, Subtipo Propiedad -->
    <div class="em-filtros-grid em-filtros-row-secundario">
        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Tipo Operación</label>
            <select id="em-filtro-tipo-operacion" class="em-filtro-select">
                <option value="">Todos</option>
                <option value="Venta">Venta</option>
                <option value="Renta">Renta</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Tipo Propiedad</label>
            <select id="em-filtro-tipo-propiedad" class="em-filtro-select">
                <option value="">Todos</option>
                <option value="Comercial">Comercial</option>
                <option value="Habitacional">Habitacional</option>
                <option value="Industrial">Industrial</option>
                <option value="Terreno">Terreno</option>
                <option value="Vacacional">Vacacional</option>
            </select>
        </div>

        <div class="em-filtro-grupo">
            <label class="em-filtro-label">Subtipo Propiedad</label>
            <select id="em-filtro-subtipo" class="em-filtro-select" disabled>
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

<!-- Contenido dinámico -->
<div id="em-resultado-container">
    <div class="em-empty">
        <div class="em-empty-icon"><i class="fas fa-search"></i></div>
        <h4>Aplique los filtros para ver el reporte</h4>
        <p>Seleccione los parámetros deseados y presione <strong>Buscar</strong></p>
    </div>
</div>  