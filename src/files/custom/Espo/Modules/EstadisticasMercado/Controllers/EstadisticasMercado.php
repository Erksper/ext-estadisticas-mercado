<?php
namespace Espo\Modules\EstadisticasMercado\Controllers;

class EstadisticasMercado extends \Espo\Core\Controllers\Record
{
    // =========================================================================
    // HELPERS COMPARTIDOS
    // =========================================================================

    protected function getPDO()
    {
        return $this->getContainer()->get('entityManager')->getPDO();
    }

    /**
     * Parsea los parámetros "anios" y "meses" del request.
     * Ambos vienen como cadenas separadas por coma, p.ej. "2023,2024".
     * Devuelve ['anios' => [int…], 'meses' => [int…]]
     */
    protected function parsePeriodo($request): array
    {
        $anios = [];
        $meses = [];

        $aniosRaw = $request->get('anios');
        $mesesRaw = $request->get('meses');

        if ($aniosRaw) {
            foreach (explode(',', $aniosRaw) as $a) {
                $a = trim($a);
                if (is_numeric($a)) $anios[] = (int)$a;
            }
        }

        if ($mesesRaw) {
            foreach (explode(',', $mesesRaw) as $m) {
                $m = trim($m);
                if (is_numeric($m)) $meses[] = (int)$m;
            }
        }

        return ['anios' => $anios, 'meses' => $meses];
    }

    /**
     * Construye cláusulas WHERE para filtrar por años y meses sobre un campo fecha.
     *
     * @param array  $anios         Años seleccionados (vacío = todos)
     * @param array  $meses         Meses seleccionados (vacío = todos)
     * @param array  $excluirMeses  Meses que SIEMPRE se excluyen (ej. [11,12])
     * @param string $campoFecha    Columna de fecha, p.ej. 'p.fecha_cierre'
     * @param array  &$binds        Array de parámetros (se modifica in-place)
     * @return array                Array de strings de condición SQL
     */
    protected function buildPeriodoWhere(
        array  $anios,
        array  $meses,
        array  $excluirMeses,
        string $campoFecha,
        array  &$binds
    ): array {
        $clauses = [];

        // Exclusión fija de meses (nov/dic en 3 reportes)
        if (!empty($excluirMeses)) {
            $ph        = implode(',', array_map('intval', $excluirMeses));
            $clauses[] = "MONTH($campoFecha) NOT IN ($ph)";
        }

        // Filtro de años seleccionados
        if (!empty($anios)) {
            $ph        = implode(',', array_fill(0, count($anios), '?'));
            $clauses[] = "YEAR($campoFecha) IN ($ph)";
            foreach ($anios as $a) $binds[] = (int)$a;
        }

        // Filtro de meses seleccionados (sin los excluidos)
        if (!empty($meses)) {
            $mesesFiltrados = array_values(array_filter($meses, function ($m) use ($excluirMeses) {
                return !in_array((int)$m, $excluirMeses, true);
            }));
            if (!empty($mesesFiltrados)) {
                $ph        = implode(',', array_fill(0, count($mesesFiltrados), '?'));
                $clauses[] = "MONTH($campoFecha) IN ($ph)";
                foreach ($mesesFiltrados as $m) $binds[] = (int)$m;
            }
        }

        return $clauses;
    }

    // =========================================================================
    // ENDPOINT: getCLAs
    // =========================================================================

    public function getActionGetCLAs($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $sth = $pdo->prepare(
                "SELECT id, name FROM team
                 WHERE id LIKE 'CLA%' AND deleted = 0
                 ORDER BY name ASC"
            );
            $sth->execute();
            $clas = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $clas[] = ['id' => $row['id'], 'name' => $row['name']];
            }
            return ['success' => true, 'data' => $clas];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // ENDPOINT: getOficinasByCLA
    // =========================================================================

    public function getActionGetOficinasByCLA($params, $data, $request)
    {
        try {
            $claId = $request->get('claId');
            if (!$claId) return ['success' => false, 'error' => 'claId es requerido'];

            $pdo     = $this->getPDO();
            $userIds = $this->getUserIdsByCLA($pdo, $claId);
            if (empty($userIds)) return ['success' => true, 'data' => []];

            $ph  = implode(',', array_fill(0, count($userIds), '?'));
            $sth = $pdo->prepare(
                "SELECT DISTINCT t.id, t.name
                 FROM team t INNER JOIN team_user tu ON t.id = tu.team_id
                 WHERE tu.user_id IN ($ph)
                 AND t.id NOT LIKE 'CLA%'
                 AND LOWER(t.id) != 'venezuela' AND LOWER(t.name) != 'venezuela'
                 AND tu.deleted = 0 AND t.deleted = 0
                 ORDER BY t.name ASC"
            );
            $sth->execute($userIds);
            $oficinas = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $oficinas[] = ['id' => $row['id'], 'name' => $row['name']];
            }
            return ['success' => true, 'data' => $oficinas];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // ENDPOINT: getAniosDisponibles  ← NUEVO
    // =========================================================================

    /**
     * Devuelve los años con registros en fecha_cierre según el reporte.
     * Los reportes con exclusión nov/dic solo devuelven años donde HAY datos
     * fuera de esos meses (para no mostrar años vacíos en el picker).
     *
     * Parámetros GET: reporte, claId (opcional), ciudad (opcional)
     */
    public function getActionGetAniosDisponibles($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $reporte = $request->get('reporte') ?? '';
            $claId   = $request->get('claId')   ?: null;
            $ciudad  = $request->get('ciudad')  ?: null;

            $sql   = '';
            $binds = [];

            // Reportes que excluyen nov/dic
            $excluirMeses = in_array($reporte, [
                'ladosPorTipoOperacion', 'ladosPorAsesor', 'ladosPorOficina'
            ]) ? ' AND MONTH(p.fecha_cierre) NOT IN (11, 12)' : '';

            switch ($reporte) {

                case 'ladosPorTipoOperacion':
                case 'ladosPorAsesor':
                case 'ladosPorOficina':
                    $sql = "SELECT DISTINCT YEAR(p.fecha_cierre) AS anio
                            FROM lados l
                            INNER JOIN propiedades p ON p.id = l.propiedad_id
                            WHERE l.deleted = 0 AND p.deleted = 0
                            AND p.fecha_cierre IS NOT NULL
                            $excluirMeses";
                    if ($claId) {
                        $ofIds = $this->getOficinaIdsByCLA($pdo, $claId);
                        if (!empty($ofIds)) {
                            $ph    = implode(',', array_fill(0, count($ofIds), '?'));
                            $sql  .= " AND l.oficina_id IN ($ph)";
                            $binds = array_merge($binds, $ofIds);
                        }
                    }
                    break;

                case 'rangoPrecios':
                    $sql = "SELECT DISTINCT YEAR(p.fecha_cierre) AS anio
                            FROM lados l
                            INNER JOIN propiedades p ON p.id = l.propiedad_id
                            WHERE l.deleted = 0 AND p.deleted = 0
                            AND p.fecha_cierre IS NOT NULL";
                    if ($claId) {
                        $ofIds = $this->getOficinaIdsByCLA($pdo, $claId);
                        if (!empty($ofIds)) {
                            $ph    = implode(',', array_fill(0, count($ofIds), '?'));
                            $sql  .= " AND l.oficina_id IN ($ph)";
                            $binds = array_merge($binds, $ofIds);
                        }
                    }
                    break;

                case 'estadisticasM2':
                    $sql = "SELECT DISTINCT YEAR(p.fecha_cierre) AS anio
                            FROM propiedades p
                            INNER JOIN lados l ON l.propiedad_id = p.id
                            WHERE p.deleted = 0 AND l.deleted = 0
                            AND p.fecha_cierre IS NOT NULL";
                    if ($ciudad) {
                        $sql   .= " AND p.ciudad = ?";
                        $binds[] = $ciudad;
                    }
                    break;

                case 'estadisticasM2Cla':
                    $sql = "SELECT DISTINCT YEAR(p.fecha_cierre) AS anio
                            FROM lados l
                            INNER JOIN propiedades p ON p.id = l.propiedad_id
                            WHERE l.deleted = 0 AND p.deleted = 0
                            AND p.fecha_cierre IS NOT NULL";
                    if ($claId) {
                        $userIds = $this->getUserIdsByCLA($pdo, $claId);
                        if (!empty($userIds)) {
                            $ph    = implode(',', array_fill(0, count($userIds), '?'));
                            $sql  .= " AND l.asesor_id IN ($ph)";
                            $binds = array_merge($binds, $userIds);
                        }
                    }
                    break;

                default:
                    $sql = "SELECT DISTINCT YEAR(p.fecha_cierre) AS anio
                            FROM lados l
                            INNER JOIN propiedades p ON p.id = l.propiedad_id
                            WHERE l.deleted = 0 AND p.deleted = 0
                            AND p.fecha_cierre IS NOT NULL";
                    break;
            }

            $sql .= " ORDER BY anio DESC";
            $sth  = $pdo->prepare($sql);
            $sth->execute($binds);

            $anios = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                if ($row['anio']) $anios[] = (int)$row['anio'];
            }

            return ['success' => true, 'data' => $anios];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // ENDPOINT: getEstados  ← NUEVO
    // =========================================================================

    public function getActionGetEstados($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $sth = $pdo->prepare(
                "SELECT DISTINCT estado FROM propiedades
                 WHERE deleted = 0 AND estado IS NOT NULL AND estado != ''
                 ORDER BY estado ASC"
            );
            $sth->execute();
            $estados = $sth->fetchAll(\PDO::FETCH_COLUMN);
            return ['success' => true, 'data' => $estados];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // ENDPOINT: getCiudades  (actualizado: acepta filtro por estado)
    // =========================================================================

    public function getActionGetCiudades($params, $data, $request)
    {
        try {
            $pdo    = $this->getPDO();
            $estado = $request->get('estado') ?: null;

            $sql   = "SELECT DISTINCT ciudad FROM propiedades
                      WHERE deleted = 0 AND ciudad IS NOT NULL AND ciudad != ''";
            $binds = [];

            if ($estado) {
                $sql   .= " AND estado = ?";
                $binds[] = $estado;
            }

            $sql .= " ORDER BY ciudad ASC";
            $sth  = $pdo->prepare($sql);
            $sth->execute($binds);

            $ciudades = $sth->fetchAll(\PDO::FETCH_COLUMN);
            return ['success' => true, 'data' => $ciudades];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // ENDPOINT: getSubtiposPorTipo  (actualizado: sin tipo devuelve TODOS)
    // =========================================================================

    public function getActionGetSubtiposPorTipo($params, $data, $request)
    {
        try {
            $pdo  = $this->getPDO();
            $tipo = $request->get('tipoPropiedad') ?: null;

            $sql   = "SELECT DISTINCT sub_tipo_propiedad FROM propiedades
                      WHERE deleted = 0
                      AND sub_tipo_propiedad IS NOT NULL AND sub_tipo_propiedad != ''";
            $binds = [];

            // Si se pasa tipo se filtra; si está vacío se devuelven todos los subtipos
            if ($tipo) {
                $sql   .= " AND tipo_propiedad = ?";
                $binds[] = $tipo;
            }

            $sql .= " ORDER BY sub_tipo_propiedad ASC";
            $sth  = $pdo->prepare($sql);
            $sth->execute($binds);

            return ['success' => true, 'data' => $sth->fetchAll(\PDO::FETCH_COLUMN)];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 1 — Lados por Tipo de Operación
    // =========================================================================

    public function getActionGetLadosPorTipoOperacion($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $claId   = $request->get('claId') ?: null;
            $periodo = $this->parsePeriodo($request);

            $oficinas = $this->resolverOficinas($pdo, $claId);
            if (empty($oficinas)) {
                return $this->respuestaVaciaReporte([], 'lados');
            }

            $oficinaIds   = array_column($oficinas, 'id');
            $binds        = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [11, 12], 'p.fecha_cierre', $binds
            );

            $ph  = implode(',', array_fill(0, count($oficinaIds), '?'));
            $sql = "SELECT l.oficina_id, p.tipo_operacion, COUNT(l.id) AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0 AND p.deleted = 0
                    AND p.fecha_cierre IS NOT NULL
                    AND p.tipo_operacion IN ('Venta','renta')
                    AND l.oficina_id IN ($ph)";

            $allBinds = array_merge($oficinaIds, $binds);

            if (!empty($periodoWhere)) {
                $sql .= " AND " . implode(' AND ', $periodoWhere);
            }
            $sql .= " GROUP BY l.oficina_id, p.tipo_operacion";

            $sth = $pdo->prepare($sql);
            $sth->execute($allBinds);

            $matriz = ['Venta' => [], 'Alquiler' => []];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $tipo = ($row['tipo_operacion'] === 'renta') ? 'Alquiler' : 'Venta';
                $matriz[$tipo][$row['oficina_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorOficina = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteos) {
                $totalFila = 0;
                $c = [];
                foreach ($oficinas as $of) {
                    $n = $conteos[$of['id']] ?? 0;
                    $c[$of['id']] = $n;
                    $totalFila += $n;
                    $totalesPorOficina[$of['id']] = ($totalesPorOficina[$of['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;
                $filas[] = ['tipo' => $tipo, 'conteos' => $c, 'total' => $totalFila];
            }

            return [
                'success'           => true,
                'oficinas'          => $oficinas,
                'filas'             => $filas,
                'totalesPorOficina' => $totalesPorOficina,
                'totalGeneral'      => $totalGeneral,
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 2 — Lados por Asesor
    // =========================================================================

    public function getActionGetLadosPorAsesor($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $claId   = $request->get('claId')     ?: null;
            $ofId    = $request->get('oficinaId') ?: null;
            $periodo = $this->parsePeriodo($request);

            $asesores = $this->resolverAsesores($pdo, $claId, $ofId);
            if (empty($asesores)) {
                return $this->respuestaVaciaReporte([], 'asesores');
            }

            $asesorIds    = array_column($asesores, 'id');
            $binds        = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [11, 12], 'p.fecha_cierre', $binds
            );

            if ($ofId) { $binds[] = $ofId; }

            $ph  = implode(',', array_fill(0, count($asesorIds), '?'));
            $bindsFinal = array_merge($binds, $asesorIds);

            $sql = "SELECT l.asesor_id, l.tipo_lado, COUNT(l.id) AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0 AND p.deleted = 0
                    AND p.fecha_cierre IS NOT NULL
                    AND l.asesor_id IS NOT NULL
                    AND l.tipo_lado IN ('obtencion','cierre')";

            if (!empty($periodoWhere)) {
                $sql .= " AND " . implode(' AND ', $periodoWhere);
            }
            if ($ofId) {
                $sql .= " AND l.oficina_id = ?";
            }
            $sql .= " AND l.asesor_id IN ($ph)";
            $sql .= " GROUP BY l.asesor_id, l.tipo_lado";

            $sth = $pdo->prepare($sql);
            $sth->execute($bindsFinal);

            $matriz = ['obtencion' => [], 'cierre' => []];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $matriz[$row['tipo_lado']][$row['asesor_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorAsesor = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteos) {
                $totalFila = 0;
                $c = [];
                foreach ($asesores as $as) {
                    $n = $conteos[$as['id']] ?? 0;
                    $c[$as['id']] = $n;
                    $totalFila += $n;
                    $totalesPorAsesor[$as['id']] = ($totalesPorAsesor[$as['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;
                $nombre = $tipo === 'obtencion' ? 'Captador (Obtención)' : 'Cerrador (Cierre)';
                $filas[] = ['tipo' => $nombre, 'conteos' => $c, 'total' => $totalFila];
            }

            $asesoresFiltrados = array_values(array_filter($asesores, function ($a) use ($totalesPorAsesor) {
                return ($totalesPorAsesor[$a['id']] ?? 0) > 0;
            }));
            usort($asesoresFiltrados, function ($a, $b) use ($totalesPorAsesor) {
                return ($totalesPorAsesor[$b['id']] ?? 0) - ($totalesPorAsesor[$a['id']] ?? 0);
            });

            return [
                'success'          => true,
                'asesores'         => $asesoresFiltrados,
                'filas'            => $filas,
                'totalesPorAsesor' => $totalesPorAsesor,
                'totalGeneral'     => $totalGeneral,
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 3 — Lados por Oficina
    // =========================================================================

    public function getActionGetLadosPorOficina($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $claId   = $request->get('claId') ?: null;
            $periodo = $this->parsePeriodo($request);

            $oficinas = $this->resolverOficinas($pdo, $claId);
            if (empty($oficinas)) {
                return $this->respuestaVaciaReporte([], 'oficinas');
            }

            $oficinaIds   = array_column($oficinas, 'id');
            $binds        = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [11, 12], 'p.fecha_cierre', $binds
            );

            $ph       = implode(',', array_fill(0, count($oficinaIds), '?'));
            $allBinds = array_merge($binds, $oficinaIds);

            $sql = "SELECT l.oficina_id, l.tipo_lado, COUNT(l.id) AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0 AND p.deleted = 0
                    AND p.fecha_cierre IS NOT NULL
                    AND l.oficina_id IS NOT NULL
                    AND l.tipo_lado IN ('obtencion','cierre')";

            if (!empty($periodoWhere)) {
                $sql .= " AND " . implode(' AND ', $periodoWhere);
            }
            $sql .= " AND l.oficina_id IN ($ph)";
            $sql .= " GROUP BY l.oficina_id, l.tipo_lado";

            $sth = $pdo->prepare($sql);
            $sth->execute($allBinds);

            $matriz = ['obtencion' => [], 'cierre' => []];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $matriz[$row['tipo_lado']][$row['oficina_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorOficina = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteos) {
                $totalFila = 0;
                $c = [];
                foreach ($oficinas as $of) {
                    $n = $conteos[$of['id']] ?? 0;
                    $c[$of['id']] = $n;
                    $totalFila += $n;
                    $totalesPorOficina[$of['id']] = ($totalesPorOficina[$of['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;
                $nombre = $tipo === 'obtencion' ? 'Captador (Obtención)' : 'Cerrador (Cierre)';
                $filas[] = ['tipo' => $nombre, 'conteos' => $c, 'total' => $totalFila];
            }

            $oficinas = array_values(array_filter($oficinas, function ($of) {
                return trim($of['name']) !== '';
            }));
            usort($oficinas, function ($a, $b) use ($totalesPorOficina) {
                return ($totalesPorOficina[$b['id']] ?? 0) - ($totalesPorOficina[$a['id']] ?? 0);
            });

            return [
                'success'           => true,
                'oficinas'          => $oficinas,
                'filas'             => $filas,
                'totalesPorOficina' => $totalesPorOficina,
                'totalGeneral'      => $totalGeneral,
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 4 — Rango de Precios
    // =========================================================================

    public function getActionGetRangoPrecios($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $claId   = $request->get('claId')            ?: null;
            $ofId    = $request->get('oficinaId')        ?: null;
            $tipOp   = $request->get('tipoOperacion')    ?: null;
            $tipProp = $request->get('tipoPropiedad')    ?: null;
            $subtipo = $request->get('subtipoPropiedad') ?: null;
            $periodo = $this->parsePeriodo($request);

            $oficinas = $this->resolverOficinas($pdo, $claId);
            if (empty($oficinas)) {
                return ['success' => true, 'filas' => [], 'totalesPorRango' => [], 'totalGeneral' => 0];
            }

            $oficinaIds   = array_column($oficinas, 'id');
            $binds        = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [], 'p.fecha_cierre', $binds
            );

            // Oficina
            if ($ofId) {
                $binds[]     = $ofId;
                $oficinaSql  = "AND l.oficina_id = ?";
            } else {
                $ph          = implode(',', array_fill(0, count($oficinaIds), '?'));
                $oficinaSql  = "AND l.oficina_id IN ($ph)";
                $binds       = array_merge($binds, $oficinaIds);
            }

            // Tipo operación
            if ($tipOp) { $binds[] = $tipOp; $tipOpSql = "AND p.tipo_operacion = ?"; }
            else        { $tipOpSql = "AND p.tipo_operacion IN ('Venta','Renta')"; }

            // Tipo propiedad
            $tipPropSql = '';
            if ($tipProp) { $binds[] = $tipProp; $tipPropSql = "AND p.tipo_propiedad = ?"; }

            // Subtipo
            $subtipoSql = '';
            if ($subtipo) { $binds[] = '%' . $subtipo . '%'; $subtipoSql = "AND p.sub_tipo_propiedad LIKE ?"; }

            $periodoSql = !empty($periodoWhere) ? "AND " . implode(' AND ', $periodoWhere) : '';

            $precioExpr = "COALESCE(NULLIF(p.precio_venta,0),NULLIF(p.precio_renta,0))";

            $rangos = [
                '< 2500'        => ['min' => null,   'max' => 2500],
                '2500-5000'     => ['min' => 2500,   'max' => 5000],
                '5000-10000'    => ['min' => 5000,   'max' => 10000],
                '10000-25000'   => ['min' => 10000,  'max' => 25000],
                '25000-50000'   => ['min' => 25000,  'max' => 50000],
                '50000-100000'  => ['min' => 50000,  'max' => 100000],
                '100000-250000' => ['min' => 100000, 'max' => 250000],
                '250000-500000' => ['min' => 250000, 'max' => 500000],
                '> 500000'      => ['min' => 500000, 'max' => null],
            ];

            $caseRango = "CASE\n";
            foreach ($rangos as $nombre => $lim) {
                if     ($lim['min'] === null) $caseRango .= "    WHEN ({$precioExpr}) < {$lim['max']} THEN '{$nombre}'\n";
                elseif ($lim['max'] === null) $caseRango .= "    WHEN ({$precioExpr}) >= {$lim['min']} THEN '{$nombre}'\n";
                else                          $caseRango .= "    WHEN ({$precioExpr}) >= {$lim['min']} AND ({$precioExpr}) < {$lim['max']} THEN '{$nombre}'\n";
            }
            $caseRango .= "    ELSE 'Otros'\nEND AS rango";

            $rangoKeys = implode(',', array_map(function ($r) { return "'$r'"; }, array_keys($rangos)));

            $sql = "SELECT COALESCE(p.sub_tipo_propiedad,'Sin subtipo') AS subtipo,
                           {$caseRango}, COUNT(l.id) AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0 AND p.deleted = 0
                    AND p.fecha_cierre IS NOT NULL
                    AND ({$precioExpr}) > 0
                    $periodoSql
                    $oficinaSql $tipOpSql $tipPropSql $subtipoSql
                    GROUP BY subtipo, rango
                    ORDER BY subtipo ASC, FIELD(rango, {$rangoKeys})";

            $sth = $pdo->prepare($sql);
            $sth->execute($binds);

            $rawData = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $rawData[$row['subtipo']][$row['rango']] = (int)$row['total'];
            }

            $subtipoList     = array_keys($rawData);
            sort($subtipoList);
            $filas           = [];
            $totalesPorRango = array_fill_keys(array_keys($rangos), 0);
            $totalGeneral    = 0;

            foreach ($subtipoList as $st) {
                $conteos = [];
                $totalSt = 0;
                foreach ($rangos as $nombre => $lim) {
                    $n = $rawData[$st][$nombre] ?? 0;
                    $conteos[$nombre] = $n;
                    $totalSt += $n;
                    $totalesPorRango[$nombre] += $n;
                    $totalGeneral += $n;
                }
                $filas[] = ['subtipo' => $st, 'conteos' => $conteos, 'total' => $totalSt];
            }

            return [
                'success'         => true,
                'subtipoList'     => $subtipoList,
                'rangoList'       => array_keys($rangos),
                'filas'           => $filas,
                'totalesPorRango' => $totalesPorRango,
                'totalGeneral'    => $totalGeneral,
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 5 — Estadísticas m² por ciudad/estado
    // =========================================================================

    public function getActionGetEstadisticasMercadoPorM2($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $ciudad  = $request->get('ciudad')           ?: null;
            $estado  = $request->get('estado')           ?: null;
            $tipOp   = $request->get('tipoOperacion')    ?: null;
            $tipProp = $request->get('tipoPropiedad')    ?: null;
            $subtipo = $request->get('subtipoPropiedad') ?: null;
            $periodo = $this->parsePeriodo($request);

            if (!$ciudad && !$estado) {
                return ['success' => false, 'error' => 'Debe seleccionar al menos un estado o ciudad.'];
            }

            // ── Condiciones de localización ───────────────────────────────────
            $locSql   = '';
            $locBinds = [];
            if ($ciudad) {
                $locSql    = " AND p.ciudad = ?";
                $locBinds[] = $ciudad;
            } elseif ($estado) {
                $locSql    = " AND p.estado = ?";
                $locBinds[] = $estado;
            }

            // ── Condiciones de período ────────────────────────────────────────
            $periodoBinds = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [], 'p.fecha_cierre', $periodoBinds
            );
            $periodoSql = !empty($periodoWhere) ? " AND " . implode(' AND ', $periodoWhere) : '';

            // ── Tipo operación ────────────────────────────────────────────────
            $tipOpSql   = $tipOp ? " AND p.tipo_operacion = ?" : " AND p.tipo_operacion IN ('Venta','Alquiler','renta')";
            $tipOpBinds = $tipOp ? [$tipOp] : [];

            // ── Tipo / subtipo propiedad ──────────────────────────────────────
            $tipPropSql   = $tipProp ? " AND p.tipo_propiedad = ?" : '';
            $tipPropBinds = $tipProp ? [$tipProp] : [];

            $subtipoSql   = $subtipo ? " AND p.sub_tipo_propiedad LIKE ?" : '';
            $subtipoBinds = $subtipo ? ['%' . $subtipo . '%'] : [];

            // ── Urbanizaciones disponibles ────────────────────────────────────
            $sqlUrb = "SELECT DISTINCT p.urbanizacion
                       FROM propiedades p
                       INNER JOIN lados l ON l.propiedad_id = p.id
                       WHERE p.deleted = 0 AND l.deleted = 0
                       AND p.urbanizacion IS NOT NULL AND p.urbanizacion != ''
                       $locSql $periodoSql $tipOpSql $tipPropSql $subtipoSql
                       ORDER BY p.urbanizacion ASC";

            $urbBinds = array_merge($locBinds, $periodoBinds, $tipOpBinds, $tipPropBinds, $subtipoBinds);
            $sth = $pdo->prepare($sqlUrb);
            $sth->execute($urbBinds);
            $urbanizaciones = $sth->fetchAll(\PDO::FETCH_COLUMN);

            if (empty($urbanizaciones)) {
                return ['success' => true, 'urbanizaciones' => [], 'filas' => [],
                        'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]];
            }

            // ── Estadísticas por urbanización ─────────────────────────────────
            $phUrb = implode(',', array_fill(0, count($urbanizaciones), '?'));

            $sqlDatos = "SELECT p.urbanizacion,
                                COUNT(DISTINCT l.id) AS lados_count,
                                AVG(CASE WHEN p.precio_cierre > 0 THEN p.precio_cierre END) AS avg_price,
                                AVG(p.m2_c) AS avg_m2,
                                AVG(CASE WHEN p.precio_cierre > 0 AND p.m2_c > 0
                                         THEN p.precio_cierre / p.m2_c END) AS avg_price_m2
                         FROM propiedades p
                         LEFT JOIN lados l ON l.propiedad_id = p.id AND l.deleted = 0
                         WHERE p.deleted = 0
                         AND p.urbanizacion IN ($phUrb)
                         $locSql $periodoSql $tipOpSql $tipPropSql $subtipoSql
                         GROUP BY p.urbanizacion";

            $datosBinds = array_merge($urbanizaciones, $locBinds, $periodoBinds, $tipOpBinds, $tipPropBinds, $subtipoBinds);
            $sth = $pdo->prepare($sqlDatos);
            $sth->execute($datosBinds);

            $datos = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $datos[$row['urbanizacion']] = [
                    'lados'        => (int)$row['lados_count'],
                    'avg_price'    => $row['avg_price']    !== null ? round((float)$row['avg_price'],    2) : null,
                    'avg_m2'       => $row['avg_m2']       !== null ? round((float)$row['avg_m2'],       2) : null,
                    'avg_price_m2' => $row['avg_price_m2'] !== null ? round((float)$row['avg_price_m2'], 2) : null,
                ];
            }

            $filas = [];
            foreach ($urbanizaciones as $urb) {
                $f = $datos[$urb] ?? ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
                if ($f['lados'] > 0) $filas[] = array_merge(['urbanizacion' => $urb], $f);
            }
            usort($filas, function ($a, $b) { return $b['lados'] - $a['lados']; });

            $totales = $this->calcularTotalesM2($filas);

            return ['success' => true,
                    'urbanizaciones' => array_column($filas, 'urbanizacion'),
                    'filas'          => $filas,
                    'totales'        => $totales];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // REPORTE 6 — Estadísticas m² por CLA
    // =========================================================================

    public function getActionGetEstadisticasM2PorCLA($params, $data, $request)
    {
        try {
            $pdo     = $this->getPDO();
            $claId   = $request->get('claId')            ?: null;
            $ofId    = $request->get('oficinaId')        ?: null;
            $tipOp   = $request->get('tipoOperacion')    ?: null;
            $tipProp = $request->get('tipoPropiedad')    ?: null;
            $subtipo = $request->get('subtipoPropiedad') ?: null;
            $periodo = $this->parsePeriodo($request);

            if (!$claId) return ['success' => false, 'error' => 'Debe seleccionar un CLA.'];

            $userIds = $this->getUserIdsByCLAAndOffice($pdo, $claId, $ofId);
            if (empty($userIds)) {
                return ['success' => true, 'urbanizaciones' => [], 'filas' => [],
                        'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]];
            }

            $phU  = implode(',', array_fill(0, count($userIds), '?'));

            $periodoBinds = [];
            $periodoWhere = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], [], 'p.fecha_cierre', $periodoBinds
            );
            $periodoSql = !empty($periodoWhere) ? " AND " . implode(' AND ', $periodoWhere) : '';

            $tipOpSql   = $tipOp   ? " AND p.tipo_operacion = ?"    : " AND p.tipo_operacion IN ('Venta','Alquiler','renta')";
            $tipOpBinds = $tipOp   ? [$tipOp]   : [];
            $tipPropSql = $tipProp ? " AND p.tipo_propiedad = ?"    : '';
            $tipPropB   = $tipProp ? [$tipProp] : [];
            $stSql      = $subtipo ? " AND p.sub_tipo_propiedad LIKE ?" : '';
            $stB        = $subtipo ? ['%' . $subtipo . '%'] : [];

            // Urbanizaciones
            $sqlUrb  = "SELECT DISTINCT p.urbanizacion
                        FROM propiedades p INNER JOIN lados l ON l.propiedad_id = p.id
                        WHERE l.asesor_id IN ($phU) AND l.deleted = 0 AND p.deleted = 0
                        AND p.urbanizacion IS NOT NULL AND p.urbanizacion != ''
                        $periodoSql $tipOpSql $tipPropSql $stSql
                        ORDER BY p.urbanizacion ASC";
            $urbB    = array_merge($userIds, $periodoBinds, $tipOpBinds, $tipPropB, $stB);
            $sth     = $pdo->prepare($sqlUrb);
            $sth->execute($urbB);
            $urbanizaciones = $sth->fetchAll(\PDO::FETCH_COLUMN);

            if (empty($urbanizaciones)) {
                return ['success' => true, 'urbanizaciones' => [], 'filas' => [],
                        'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]];
            }

            $phUrb   = implode(',', array_fill(0, count($urbanizaciones), '?'));
            $sqlDat  = "SELECT p.urbanizacion,
                               COUNT(DISTINCT l.id) AS lados_count,
                               AVG(CASE WHEN p.precio_cierre > 0 THEN p.precio_cierre END) AS avg_price,
                               AVG(p.m2_c) AS avg_m2,
                               AVG(CASE WHEN p.precio_cierre > 0 AND p.m2_c > 0
                                        THEN p.precio_cierre / p.m2_c END) AS avg_price_m2
                        FROM propiedades p INNER JOIN lados l ON l.propiedad_id = p.id
                        WHERE l.asesor_id IN ($phU) AND l.deleted = 0 AND p.deleted = 0
                        AND p.urbanizacion IN ($phUrb)
                        $periodoSql $tipOpSql $tipPropSql $stSql
                        GROUP BY p.urbanizacion";
            $datB    = array_merge($userIds, $urbanizaciones, $periodoBinds, $tipOpBinds, $tipPropB, $stB);
            $sth     = $pdo->prepare($sqlDat);
            $sth->execute($datB);

            $datos = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $datos[$row['urbanizacion']] = [
                    'lados'        => (int)$row['lados_count'],
                    'avg_price'    => $row['avg_price']    !== null ? round((float)$row['avg_price'],    2) : null,
                    'avg_m2'       => $row['avg_m2']       !== null ? round((float)$row['avg_m2'],       2) : null,
                    'avg_price_m2' => $row['avg_price_m2'] !== null ? round((float)$row['avg_price_m2'], 2) : null,
                ];
            }

            $filas = [];
            foreach ($urbanizaciones as $urb) {
                $f = $datos[$urb] ?? ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
                if ($f['lados'] > 0) $filas[] = array_merge(['urbanizacion' => $urb], $f);
            }
            usort($filas, function ($a, $b) { return $b['lados'] - $a['lados']; });

            return ['success' => true,
                    'urbanizaciones' => array_column($filas, 'urbanizacion'),
                    'filas'          => $filas,
                    'totales'        => $this->calcularTotalesM2($filas)];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // DETALLE DE PROPIEDADES (paginado)
    // =========================================================================

    public function getActionGetDetalleLados($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();

            $pagina    = max(1,   (int)($request->get('pagina')    ?? 1));
            $porPagina = max(1, min(100, (int)($request->get('porPagina') ?? 25)));
            $offset    = ($pagina - 1) * $porPagina;

            $reporte       = $request->get('reporte')        ?? '';
            $seleccion     = $request->get('seleccion')      ?? '';
            $identificador = $request->get('identificador')  ?? '';

            $claId   = $request->get('claId')            ?: null;
            $ofId    = $request->get('oficinaId')        ?: null;
            $tipOp   = $request->get('tipoOperacion')    ?: null;
            $tipProp = $request->get('tipoPropiedad')    ?: null;
            $subtipo = $request->get('subtipoPropiedad') ?: null;
            $ciudad  = $request->get('ciudad')           ?: null;
            $estado  = $request->get('estado')           ?: null;

            $periodo = $this->parsePeriodo($request);

            // Reportes que excluyen nov/dic
            $excluirMeses = in_array($reporte, [
                'ladosPorTipoOperacion', 'ladosPorAsesor', 'ladosPorOficina'
            ]) ? [11, 12] : [];

            $where = [
                'l.deleted = 0',
                'p.deleted = 0',
                'p.fecha_cierre IS NOT NULL',
            ];
            $binds = [];

            // Período
            $periodoC = $this->buildPeriodoWhere(
                $periodo['anios'], $periodo['meses'], $excluirMeses, 'p.fecha_cierre', $binds
            );
            $where = array_merge($where, $periodoC);

            // Filtros globales comunes
            if ($tipOp && in_array($reporte, ['rangoPrecios', 'estadisticasM2', 'estadisticasM2Cla'])) {
                $where[] = 'p.tipo_operacion = ?'; $binds[] = $tipOp;
            }
            if ($tipProp) { $where[] = 'p.tipo_propiedad = ?';          $binds[] = $tipProp; }
            if ($subtipo) { $where[] = 'p.sub_tipo_propiedad LIKE ?';   $binds[] = '%'.$subtipo.'%'; }
            if ($ciudad)  { $where[] = 'p.ciudad = ?';                  $binds[] = $ciudad; }
            elseif ($estado) { $where[] = 'p.estado = ?';               $binds[] = $estado; }

            $oficinasDelCla = $claId ? $this->getOficinaIdsByCLA($pdo, $claId) : [];
            if ($claId && empty($oficinasDelCla)) return $this->respuestaVaciaPaginada($pagina, $porPagina);

            // ── Condiciones específicas por reporte ───────────────────────────
            switch ($reporte) {

                case 'ladosPorTipoOperacion':
                    $where[] = "p.tipo_operacion IN ('Venta','renta')";
                    if ($seleccion === 'columna') {
                        $where[] = 'l.oficina_id = ?'; $binds[] = $identificador;
                    } elseif ($seleccion === 'fila') {
                        $valorBD = ($identificador === 'Alquiler') ? 'renta' : 'Venta';
                        $where   = array_values(array_filter($where, function ($c) {
                            return $c !== "p.tipo_operacion IN ('Venta','renta')";
                        }));
                        $where[] = 'p.tipo_operacion = ?'; $binds[] = $valorBD;
                        if (!empty($oficinasDelCla)) {
                            $ph = implode(',', array_fill(0, count($oficinasDelCla), '?'));
                            $where[] = "l.oficina_id IN ($ph)";
                            $binds   = array_merge($binds, $oficinasDelCla);
                        }
                    }
                    break;

                case 'ladosPorAsesor':
                    $where[] = "l.tipo_lado IN ('obtencion','cierre')";
                    if ($seleccion === 'columna') {
                        $where[] = 'l.asesor_id = ?'; $binds[] = $identificador;
                    } elseif ($seleccion === 'fila') {
                        $tBD = ($identificador === 'Captador (Obtención)') ? 'obtencion' : 'cierre';
                        $where[] = 'l.tipo_lado = ?'; $binds[] = $tBD;
                        if ($ofId) { $where[] = 'l.oficina_id = ?'; $binds[] = $ofId; }
                        if (!empty($oficinasDelCla)) {
                            $ph = implode(',', array_fill(0, count($oficinasDelCla), '?'));
                            $where[] = "l.oficina_id IN ($ph)"; $binds = array_merge($binds, $oficinasDelCla);
                        }
                    }
                    break;

                case 'ladosPorOficina':
                    $where[] = "l.tipo_lado IN ('obtencion','cierre')";
                    if ($seleccion === 'columna') {
                        $where[] = 'l.oficina_id = ?'; $binds[] = $identificador;
                    } elseif ($seleccion === 'fila') {
                        $tBD = ($identificador === 'Captador (Obtención)') ? 'obtencion' : 'cierre';
                        $where[] = 'l.tipo_lado = ?'; $binds[] = $tBD;
                        if (!empty($oficinasDelCla)) {
                            $ph = implode(',', array_fill(0, count($oficinasDelCla), '?'));
                            $where[] = "l.oficina_id IN ($ph)"; $binds = array_merge($binds, $oficinasDelCla);
                        }
                    }
                    break;

                case 'rangoPrecios':
                    if ($ofId) { $where[] = 'l.oficina_id = ?'; $binds[] = $ofId; }
                    elseif (!empty($oficinasDelCla)) {
                        $ph = implode(',', array_fill(0, count($oficinasDelCla), '?'));
                        $where[] = "l.oficina_id IN ($ph)"; $binds = array_merge($binds, $oficinasDelCla);
                    }
                    $px = "COALESCE(NULLIF(p.precio_venta,0),NULLIF(p.precio_renta,0))";
                    $where[] = "($px) > 0";
                    if ($seleccion === 'columna') {
                        $c = $this->rangoACondicion($identificador, $px, $binds);
                        if ($c) $where[] = $c;
                    } elseif ($seleccion === 'fila') {
                        $where[] = 'p.sub_tipo_propiedad = ?'; $binds[] = $identificador;
                    }
                    break;

                case 'estadisticasM2Cla':
                    $uIds = $this->getUserIdsByCLAAndOffice($pdo, $claId, $ofId);
                    if (empty($uIds)) return $this->respuestaVaciaPaginada($pagina, $porPagina);
                    $ph = implode(',', array_fill(0, count($uIds), '?'));
                    $where[] = "l.asesor_id IN ($ph)"; $binds = array_merge($binds, $uIds);
                    if (!$tipOp) $where[] = "p.tipo_operacion IN ('Venta','renta')";
                    $where[] = 'p.urbanizacion = ?'; $binds[] = $identificador;
                    break;

                case 'estadisticasM2':
                    if (!$tipOp) $where[] = "p.tipo_operacion IN ('Venta','renta')";
                    $where[] = 'p.urbanizacion = ?'; $binds[] = $identificador;
                    break;

                default:
                    return ['success' => false, 'error' => 'Reporte no reconocido: ' . $reporte];
            }

            // ── Debug info (visible en la respuesta JSON) ─────────────────────
            $debugInfo = [
                'reporte'       => $reporte,
                'seleccion'     => $seleccion,
                'identificador' => $identificador,
                'where_clauses' => $where,
                'binds'         => $binds,
                'periodo'       => $periodo,
                'excluirMeses'  => $excluirMeses,
            ];

            $whereSql = implode(' AND ', $where);

            // Conteo total
            $sthC = $pdo->prepare(
                "SELECT COUNT(l.id) AS total FROM lados l
                 INNER JOIN propiedades p ON p.id = l.propiedad_id
                 WHERE $whereSql"
            );
            $sthC->execute($binds);
            $total = (int)$sthC->fetchColumn();

            // Datos paginados
            $sqlData = "SELECT
                            l.id                                                                        AS lado_id,
                            p.id                                                                        AS propiedad_id,
                            CONCAT_WS(', ',
                                NULLIF(TRIM(p.numero),''), NULLIF(TRIM(p.calle),''),
                                NULLIF(TRIM(p.urbanizacion),''), NULLIF(TRIM(p.municipio),''),
                                NULLIF(TRIM(p.ciudad),''), NULLIF(TRIM(p.estado),'')
                            )                                                                           AS direccion,
                            l.tipo_lado,
                            p.tipo_operacion,
                            t.name                                                                      AS oficina_nombre,
                            CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))              AS asesor_nombre,
                            p.tipo_propiedad,
                            p.sub_tipo_propiedad,
                            DATE_FORMAT(p.fecha_cierre, '%d/%m/%Y')                                     AS fecha_cierre,
                            COALESCE(NULLIF(p.precio_venta,0),NULLIF(p.precio_renta,0))                 AS precio_inicial,
                            p.precio_cierre,
                            p.m2_c                                                                      AS area_construccion,
                            CASE WHEN p.m2_c > 0 AND p.precio_cierre > 0
                                 THEN ROUND(p.precio_cierre / p.m2_c, 2) ELSE NULL END                  AS precio_por_m2
                        FROM lados l
                        INNER JOIN propiedades p ON p.id = l.propiedad_id
                        LEFT  JOIN team t         ON t.id = l.oficina_id
                        LEFT  JOIN user u         ON u.id = l.asesor_id
                        WHERE $whereSql
                        ORDER BY p.fecha_cierre DESC, p.id ASC
                        LIMIT ? OFFSET ?";

            $sthD = $pdo->prepare($sqlData);
            foreach ($binds as $i => $v) {
                $sthD->bindValue($i + 1, $v, \PDO::PARAM_STR);
            }
            $sthD->bindValue(count($binds) + 1, $porPagina, \PDO::PARAM_INT);
            $sthD->bindValue(count($binds) + 2, $offset,    \PDO::PARAM_INT);
            $sthD->execute();

            $filas = $sthD->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($filas as &$fila) {
                $fila['tipo_lado']      = $this->labelTipoLado($fila['tipo_lado']);
                $fila['tipo_operacion'] = $this->labelTipoOperacion($fila['tipo_operacion']);
                foreach (['precio_inicial', 'precio_cierre', 'area_construccion', 'precio_por_m2'] as $c) {
                    $fila[$c] = $fila[$c] !== null ? (float)$fila[$c] : null;
                }
            }
            unset($fila);

            return [
                'success'   => true,
                'data'      => $filas,
                'total'     => $total,
                'pagina'    => $pagina,
                'porPagina' => $porPagina,
                '_debug'    => $debugInfo,   // ← para inspección desde consola del frontend
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // =========================================================================
    // HELPERS PRIVADOS
    // =========================================================================

    protected function resolverOficinas($pdo, $claId)
    {
        if ($claId) {
            $userIds = $this->getUserIdsByCLA($pdo, $claId);
            if (empty($userIds)) return [];
            $ph  = implode(',', array_fill(0, count($userIds), '?'));
            $sth = $pdo->prepare(
                "SELECT DISTINCT t.id, t.name
                 FROM team t INNER JOIN team_user tu ON t.id = tu.team_id
                 WHERE tu.user_id IN ($ph)
                 AND t.id NOT LIKE 'CLA%'
                 AND LOWER(t.id) != 'venezuela' AND LOWER(t.name) != 'venezuela'
                 AND tu.deleted = 0 AND t.deleted = 0
                 ORDER BY t.name ASC"
            );
            $sth->execute($userIds);
        } else {
            $sth = $pdo->prepare(
                "SELECT id, name FROM team
                 WHERE id NOT LIKE 'CLA%'
                 AND LOWER(id) != 'venezuela' AND LOWER(name) != 'venezuela'
                 AND deleted = 0 ORDER BY name ASC"
            );
            $sth->execute();
        }
        $oficinas = [];
        while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
            $oficinas[] = ['id' => $row['id'], 'name' => $row['name']];
        }
        return $oficinas;
    }

    protected function getUserIdsByCLA($pdo, $claId): array
    {
        $sth = $pdo->prepare(
            "SELECT DISTINCT user_id FROM team_user WHERE team_id = ? AND deleted = 0"
        );
        $sth->execute([$claId]);
        return $sth->fetchAll(\PDO::FETCH_COLUMN);
    }

    protected function getOficinaIdsByCLA($pdo, $claId): array
    {
        $userIds = $this->getUserIdsByCLA($pdo, $claId);
        if (empty($userIds)) return [];
        $ph  = implode(',', array_fill(0, count($userIds), '?'));
        $sth = $pdo->prepare(
            "SELECT DISTINCT t.id FROM team t
             INNER JOIN team_user tu ON t.id = tu.team_id
             WHERE tu.user_id IN ($ph)
             AND t.id NOT LIKE 'CLA%'
             AND LOWER(t.id) != 'venezuela' AND LOWER(t.name) != 'venezuela'
             AND tu.deleted = 0 AND t.deleted = 0"
        );
        $sth->execute($userIds);
        return $sth->fetchAll(\PDO::FETCH_COLUMN);
    }

    protected function getUserIdsByCLAAndOffice($pdo, $claId, $ofId = null): array
    {
        if (!$claId) return [];
        $sql    = "SELECT DISTINCT u.id FROM user u
                   INNER JOIN team_user tu ON tu.user_id = u.id AND tu.team_id = ? AND tu.deleted = 0
                   WHERE u.deleted = 0";
        $params = [$claId];
        if ($ofId) {
            $sql    .= " AND EXISTS (SELECT 1 FROM team_user tu2
                                     WHERE tu2.user_id = u.id AND tu2.team_id = ? AND tu2.deleted = 0)";
            $params[] = $ofId;
        }
        $sth = $pdo->prepare($sql);
        $sth->execute($params);
        return $sth->fetchAll(\PDO::FETCH_COLUMN);
    }

    protected function resolverAsesores($pdo, $claId, $ofId = null): array
    {
        if ($ofId) {
            $sql    = "SELECT DISTINCT u.id, CONCAT(u.first_name,' ',u.last_name) AS name
                       FROM user u INNER JOIN lados l ON l.asesor_id = u.id
                       WHERE l.deleted = 0 AND l.oficina_id = ? AND u.deleted = 0";
            $params = [$ofId];
            if ($claId) {
                $sql    .= " AND EXISTS (SELECT 1 FROM team_user tu
                                         WHERE tu.user_id = u.id AND tu.team_id = ? AND tu.deleted = 0)";
                $params[] = $claId;
            }
        } else {
            $sql    = "SELECT DISTINCT u.id, CONCAT(u.first_name,' ',u.last_name) AS name FROM user u";
            $params = [];
            if ($claId) {
                $sql    .= " INNER JOIN team_user tu ON tu.user_id = u.id AND tu.team_id = ? AND tu.deleted = 0";
                $params[] = $claId;
            } else {
                $sql .= " INNER JOIN lados l ON l.asesor_id = u.id";
            }
            $sql .= " WHERE u.deleted = 0";
            if (!$claId) $sql .= " AND l.deleted = 0";
        }
        $sql .= " ORDER BY name ASC";
        $sth  = $pdo->prepare($sql);
        $sth->execute($params);
        $asesores = [];
        while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
            if (trim($row['name'])) $asesores[] = ['id' => $row['id'], 'name' => $row['name']];
        }
        return $asesores;
    }

    protected function rangoACondicion($rango, $precioExpr, &$binds)
    {
        $rangos = [
            '< 2500'        => ['min' => null,   'max' => 2500],
            '2500-5000'     => ['min' => 2500,   'max' => 5000],
            '5000-10000'    => ['min' => 5000,   'max' => 10000],
            '10000-25000'   => ['min' => 10000,  'max' => 25000],
            '25000-50000'   => ['min' => 25000,  'max' => 50000],
            '50000-100000'  => ['min' => 50000,  'max' => 100000],
            '100000-250000' => ['min' => 100000, 'max' => 250000],
            '250000-500000' => ['min' => 250000, 'max' => 500000],
            '> 500000'      => ['min' => 500000, 'max' => null],
        ];
        if (!isset($rangos[$rango])) return null;
        $r = $rangos[$rango];
        if ($r['min'] === null) { $binds[] = $r['max']; return "($precioExpr) < ?"; }
        if ($r['max'] === null) { $binds[] = $r['min']; return "($precioExpr) >= ?"; }
        $binds[] = $r['min']; $binds[] = $r['max'];
        return "($precioExpr) >= ? AND ($precioExpr) < ?";
    }

    protected function calcularTotalesM2(array $filas): array
    {
        $totales = ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
        $ps = []; $ms = []; $pm2s = [];
        foreach ($filas as $f) {
            $totales['lados'] += $f['lados'];
            if ($f['avg_price']    !== null) $ps[]   = $f['avg_price'];
            if ($f['avg_m2']       !== null) $ms[]   = $f['avg_m2'];
            if ($f['avg_price_m2'] !== null) $pm2s[] = $f['avg_price_m2'];
        }
        if (!empty($ps))   $totales['avg_price']    = round(array_sum($ps)   / count($ps),   2);
        if (!empty($ms))   $totales['avg_m2']       = round(array_sum($ms)   / count($ms),   2);
        if (!empty($pm2s)) $totales['avg_price_m2'] = round(array_sum($pm2s) / count($pm2s), 2);
        return $totales;
    }

    protected function respuestaVaciaReporte(array $extra, string $tipo): array
    {
        $base = ['success' => true, 'filas' => [], 'totalGeneral' => 0];
        if ($tipo === 'lados')    return array_merge($base, ['oficinas' => [], 'totalesPorOficina' => []]);
        if ($tipo === 'asesores') return array_merge($base, ['asesores' => [], 'totalesPorAsesor'  => []]);
        if ($tipo === 'oficinas') return array_merge($base, ['oficinas' => [], 'totalesPorOficina' => []]);
        return $base;
    }

    protected function respuestaVaciaPaginada(int $pagina, int $porPagina): array
    {
        return ['success' => true, 'data' => [], 'total' => 0, 'pagina' => $pagina, 'porPagina' => $porPagina];
    }

    protected function labelTipoLado($v): string
    {
        return ['obtencion' => 'Captador (Obtención)', 'cierre' => 'Cerrador (Cierre)'][$v] ?? (string)$v;
    }

    protected function labelTipoOperacion($v): string
    {
        return ['renta' => 'Alquiler', 'Venta' => 'Venta'][$v] ?? (string)$v;
    }
}