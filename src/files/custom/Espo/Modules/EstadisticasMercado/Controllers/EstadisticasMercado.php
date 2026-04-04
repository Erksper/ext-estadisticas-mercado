<?php
namespace Espo\Modules\EstadisticasMercado\Controllers;

use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\Error;

class EstadisticasMercado extends \Espo\Core\Controllers\Record
{
    // ─────────────────────────────────────────────────────────────
    // Helpers compartidos
    // ─────────────────────────────────────────────────────────────

    protected function getPDO()
    {
        return $this->getContainer()->get('entityManager')->getPDO();
    }

    /**
     * Devuelve todos los CLAs (teams cuyo id empieza por CLA).
     */
    public function getActionGetCLAs($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();

            $sql = "SELECT id, name
                    FROM team
                    WHERE id LIKE 'CLA%'
                    AND deleted = 0
                    ORDER BY name ASC";

            $sth = $pdo->prepare($sql);
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

    /**
     * Devuelve las oficinas (teams que no son CLA ni Venezuela)
     * cuyos miembros también pertenecen al CLA solicitado.
     */
    public function getActionGetOficinasByCLA($params, $data, $request)
    {
        try {
            $claId = $request->get('claId');

            if (!$claId) {
                return ['success' => false, 'error' => 'claId es requerido'];
            }

            $pdo = $this->getPDO();

            // 1. Usuarios del CLA
            $sql = "SELECT DISTINCT user_id
                    FROM team_user
                    WHERE team_id = ?
                    AND deleted = 0";
            $sth = $pdo->prepare($sql);
            $sth->execute([$claId]);

            $userIds = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $userIds[] = $row['user_id'];
            }

            if (empty($userIds)) {
                return ['success' => true, 'data' => []];
            }

            // 2. Teams de esos usuarios que NO son CLA ni Venezuela
            $placeholders = implode(',', array_fill(0, count($userIds), '?'));

            $sql = "SELECT DISTINCT t.id, t.name
                    FROM team t
                    INNER JOIN team_user tu ON t.id = tu.team_id
                    WHERE tu.user_id IN ($placeholders)
                    AND t.id NOT LIKE 'CLA%'
                    AND LOWER(t.id)   != 'venezuela'
                    AND LOWER(t.name) != 'venezuela'
                    AND tu.deleted = 0
                    AND t.deleted  = 0
                    ORDER BY t.name ASC";

            $sth = $pdo->prepare($sql);
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

    // ─────────────────────────────────────────────────────────────
    // Reporte 1 — Lados por Tipo de Operación
    // ─────────────────────────────────────────────────────────────

    /**
     * Parámetros GET opcionales:
     *   fechaInicio (YYYY-MM-DD)
     *   fechaFin    (YYYY-MM-DD)
     *   claId
     *
     * Respuesta:
     * {
     *   success: true,
     *   oficinas: [ {id, name}, … ],
     *   filas: [
     *     { tipo: "Venta",    conteos: { <oficinaId>: N, … }, total: N },
     *     { tipo: "Alquiler", conteos: { <oficinaId>: N, … }, total: N }
     *   ],
     *   totalesPorOficina: { <oficinaId>: N, … },
     *   totalGeneral: N
     * }
     */
    public function getActionGetLadosPorTipoOperacion($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $claId = $request->get('claId');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');

            $oficinas = $this->resolverOficinas($pdo, $claId);
            if (empty($oficinas)) {
                return [
                    'success'           => true,
                    'oficinas'          => [],
                    'filas'             => $this->filasPorDefecto([]),
                    'totalesPorOficina' => [],
                    'totalGeneral'      => 0,
                ];
            }

            $oficinaIds = array_column($oficinas, 'id');

            $whereClauses = [];
            $bindParams = [];

            if ($fechaInicio && $fechaFin) {
                $whereClauses[] = "p.fecha_cierre BETWEEN ? AND ?";
                $bindParams[] = $fechaInicio;
                $bindParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $whereClauses[] = "p.fecha_cierre >= ?";
                $bindParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $whereClauses[] = "p.fecha_cierre <= ?";
                $bindParams[] = $fechaFin;
            } else {
                return ['success' => false, 'error' => 'Debe especificar al menos un rango de fechas.'];
            }

            $placeholderOficinas = implode(',', array_fill(0, count($oficinaIds), '?'));
            $sql = "SELECT
                        l.oficina_id                          AS oficina_id,
                        p.tipo_operacion                      AS tipo_operacion,
                        COUNT(l.id)                           AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0
                    AND p.deleted = 0
                    AND p.tipo_operacion IN ('Venta','renta')
                    AND p.fecha_cierre IS NOT NULL
                    AND l.oficina_id IN ($placeholderOficinas)
                    AND " . implode(' AND ', $whereClauses) . "
                    GROUP BY l.oficina_id, p.tipo_operacion";

            $allParams = array_merge($oficinaIds, $bindParams);
            $sth = $pdo->prepare($sql);
            $sth->execute($allParams);

            $matriz = [
                'Venta'    => [],
                'Alquiler' => [],
            ];

            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $tipo = ($row['tipo_operacion'] === 'renta') ? 'Alquiler' : 'Venta';
                $matriz[$tipo][$row['oficina_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorOficina = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteosPorOficina) {
                $totalFila = 0;
                $conteos   = [];
                foreach ($oficinas as $of) {
                    $n = $conteosPorOficina[$of['id']] ?? 0;
                    $conteos[$of['id']] = $n;
                    $totalFila += $n;
                    $totalesPorOficina[$of['id']] = ($totalesPorOficina[$of['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;
                $filas[] = [
                    'tipo'    => $tipo,
                    'conteos' => $conteos,
                    'total'   => $totalFila,
                ];
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

    // ─────────────────────────────────────────────────────────────
    // Helpers privados
    // ─────────────────────────────────────────────────────────────

    /**
     * Si hay claId devuelve solo las oficinas de ese CLA.
     * Si no hay claId devuelve TODAS las oficinas (no-CLA, no-Venezuela).
     */
    protected function resolverOficinas($pdo, $claId)
    {
        if ($claId) {
            // Usuarios del CLA
            $sth = $pdo->prepare(
                "SELECT DISTINCT user_id FROM team_user
                 WHERE team_id = ? AND deleted = 0"
            );
            $sth->execute([$claId]);

            $userIds = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $userIds[] = $row['user_id'];
            }

            if (empty($userIds)) {
                return [];
            }

            $ph  = implode(',', array_fill(0, count($userIds), '?'));
            $sth = $pdo->prepare(
                "SELECT DISTINCT t.id, t.name
                 FROM team t
                 INNER JOIN team_user tu ON t.id = tu.team_id
                 WHERE tu.user_id IN ($ph)
                 AND t.id NOT LIKE 'CLA%'
                 AND LOWER(t.id)   != 'venezuela'
                 AND LOWER(t.name) != 'venezuela'
                 AND tu.deleted = 0
                 AND t.deleted  = 0
                 ORDER BY t.name ASC"
            );
            $sth->execute($userIds);

        } else {
            // Todas las oficinas que no sean CLA ni Venezuela
            $sth = $pdo->prepare(
                "SELECT id, name FROM team
                 WHERE id NOT LIKE 'CLA%'
                 AND LOWER(id)   != 'venezuela'
                 AND LOWER(name) != 'venezuela'
                 AND deleted = 0
                 ORDER BY name ASC"
            );
            $sth->execute();
        }

        $oficinas = [];
        while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
            $oficinas[] = ['id' => $row['id'], 'name' => $row['name']];
        }

        return $oficinas;
    }

    protected function filasPorDefecto(array $oficinas)
    {
        $conteos = [];
        foreach ($oficinas as $of) {
            $conteos[$of['id']] = 0;
        }

        return [
            ['tipo' => 'Venta',    'conteos' => $conteos, 'total' => 0],
            ['tipo' => 'Alquiler', 'conteos' => $conteos, 'total' => 0],
        ];
    }

    public function getActionGetRangoPrecios($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $claId = $request->get('claId');
            $oficinaId = $request->get('oficinaId');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');
            $tipoOperacion = $request->get('tipoOperacion');
            $tipoPropiedad = $request->get('tipoPropiedad');
            $subtipoPropiedad = $request->get('subtipoPropiedad');

            // Validar fechas
            if ($fechaInicio && $fechaFin && $fechaInicio > $fechaFin) {
                return ['success' => false, 'error' => 'La fecha de inicio no puede ser mayor a la fecha fin.'];
            }

            // Obtener oficinas según CLA
            $oficinas = $this->resolverOficinas($pdo, $claId);
            if (empty($oficinas)) {
                return ['success' => true, 'oficinas' => [], 'filas' => [], 'totalesPorRango' => [], 'totalGeneral' => 0];
            }

            $oficinaIds = array_column($oficinas, 'id');
            if ($oficinaId && !in_array($oficinaId, $oficinaIds)) {
                return ['success' => true, 'data' => []];
            }

            // Construir condiciones WHERE
            $whereClauses = [];
            $bindParams = [];

            // Oficinas
            if ($oficinaId) {
                $whereClauses[] = "l.oficina_id = ?";
                $bindParams[] = $oficinaId;
            } else {
                $placeholders = implode(',', array_fill(0, count($oficinaIds), '?'));
                $whereClauses[] = "l.oficina_id IN ($placeholders)";
                $bindParams = array_merge($bindParams, $oficinaIds);
            }

            // Fechas
            if ($fechaInicio && $fechaFin) {
                $whereClauses[] = "p.fecha_cierre BETWEEN ? AND ?";
                $bindParams[] = $fechaInicio;
                $bindParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $whereClauses[] = "p.fecha_cierre >= ?";
                $bindParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $whereClauses[] = "p.fecha_cierre <= ?";
                $bindParams[] = $fechaFin;
            } else {
                return ['success' => false, 'error' => 'Debe especificar al menos un rango de fechas.'];
            }

            // Tipo operación
            if ($tipoOperacion) {
                $whereClauses[] = "p.tipo_operacion = ?";
                $bindParams[] = $tipoOperacion;
            } else {
                $whereClauses[] = "p.tipo_operacion IN ('Venta','Renta')";
            }

            // Tipo propiedad
            if ($tipoPropiedad) {
                $whereClauses[] = "p.tipo_propiedad = ?";
                $bindParams[] = $tipoPropiedad;
            }

            // Subtipo propiedad (búsqueda parcial)
            if ($subtipoPropiedad) {
                $whereClauses[] = "p.sub_tipo_propiedad LIKE ?";
                $bindParams[] = '%' . $subtipoPropiedad . '%';
            }

            $whereSql = implode(' AND ', $whereClauses);

            // Definir rangos
            $rangos = [
                '< 2500' => ['min' => null, 'max' => 2500],
                '2500-5000' => ['min' => 2500, 'max' => 5000],
                '5000-10000' => ['min' => 5000, 'max' => 10000],
                '10000-25000' => ['min' => 10000, 'max' => 25000],
                '25000-50000' => ['min' => 25000, 'max' => 50000],
                '50000-100000' => ['min' => 50000, 'max' => 100000],
                '100000-250000' => ['min' => 100000, 'max' => 250000],
                '250000-500000' => ['min' => 250000, 'max' => 500000],
                '> 500000' => ['min' => 500000, 'max' => null]
            ];

            // Expresión del precio (usa precioVenta o precioRenta)
            $precioExpr = "COALESCE(NULLIF(p.precio_venta, 0), NULLIF(p.precio_renta, 0))";

            // Construir CASE para el rango
            $caseRango = "CASE\n";
            foreach ($rangos as $nombre => $limites) {
                if ($limites['min'] === null) {
                    $caseRango .= "    WHEN {$precioExpr} < {$limites['max']} THEN '{$nombre}'\n";
                } elseif ($limites['max'] === null) {
                    $caseRango .= "    WHEN {$precioExpr} >= {$limites['min']} THEN '{$nombre}'\n";
                } else {
                    $caseRango .= "    WHEN {$precioExpr} >= {$limites['min']} AND {$precioExpr} < {$limites['max']} THEN '{$nombre}'\n";
                }
            }
            $caseRango .= "    ELSE 'Otros'\nEND AS rango";

            $sql = "SELECT 
                        COALESCE(p.sub_tipo_propiedad, 'Sin subtipo') AS subtipo,
                        {$caseRango},
                        COUNT(l.id) AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0
                    AND p.deleted = 0
                    AND p.fecha_cierre IS NOT NULL
                    AND (p.precio_venta > 0 OR p.precio_renta > 0)
                    AND {$whereSql}
                    GROUP BY subtipo, rango
                    ORDER BY subtipo ASC, FIELD(rango, " . implode(',', array_map(function($r) { return "'$r'"; }, array_keys($rangos))) . ")";

            $sth = $pdo->prepare($sql);
            $sth->execute($bindParams);

            $rawData = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $subtipo = $row['subtipo'];
                $rango = $row['rango'];
                $total = (int)$row['total'];
                $rawData[$subtipo][$rango] = $total;
            }

            // Procesar resultados
            $subtipoList = array_keys($rawData);
            sort($subtipoList);

            $filas = [];
            $totalesPorRango = array_fill_keys(array_keys($rangos), 0);
            $totalGeneral = 0;

            foreach ($subtipoList as $subtipo) {
                $conteos = [];
                $totalSubtipo = 0;
                foreach ($rangos as $nombre => $limites) {
                    $n = isset($rawData[$subtipo][$nombre]) ? $rawData[$subtipo][$nombre] : 0;
                    $conteos[$nombre] = $n;
                    $totalSubtipo += $n;
                    $totalesPorRango[$nombre] += $n;
                    $totalGeneral += $n;
                }
                $filas[] = [
                    'subtipo' => $subtipo,
                    'conteos' => $conteos,
                    'total' => $totalSubtipo
                ];
            }

            return [
                'success' => true,
                'subtipoList' => $subtipoList,
                'rangoList' => array_keys($rangos),
                'filas' => $filas,
                'totalesPorRango' => $totalesPorRango,
                'totalGeneral' => $totalGeneral
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getActionGetLadosIdsParaDetalle($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $reporte = $request->get('reporte');
            $tipoSeleccion = $request->get('tipoSeleccion');
            $identificador = $request->get('identificador');
            $filtrosJson = $request->get('filtros');
            $filtros = json_decode($filtrosJson, true);
            if (!$filtros) $filtros = [];

            // Extraer parámetros comunes
            $claId = $filtros['claId'] ?? null;
            $oficinaId = $filtros['oficinaId'] ?? null;
            $fechaInicio = $filtros['fechaInicio'] ?? null;
            $fechaFin = $filtros['fechaFin'] ?? null;
            $tipoOperacion = $filtros['tipoOperacion'] ?? null;
            $tipoPropiedad = $filtros['tipoPropiedad'] ?? null;
            $subtipoPropiedad = $filtros['subtipoPropiedad'] ?? null;
            $ciudad = $filtros['ciudad'] ?? null;

            // Condiciones base
            $where = ['l.deleted = 0', 'p.deleted = 0', 'p.fecha_cierre IS NOT NULL'];
            $params = [];

            // Fechas
            if ($fechaInicio && $fechaFin) {
                $where[] = 'p.fecha_cierre BETWEEN ? AND ?';
                $params[] = $fechaInicio;
                $params[] = $fechaFin;
            } elseif ($fechaInicio) {
                $where[] = 'p.fecha_cierre >= ?';
                $params[] = $fechaInicio;
            } elseif ($fechaFin) {
                $where[] = 'p.fecha_cierre <= ?';
                $params[] = $fechaFin;
            }

            // Tipo operación
            if ($tipoOperacion) {
                $where[] = 'p.tipo_operacion = ?';
                $params[] = $tipoOperacion;
            } else {
                $where[] = "p.tipo_operacion IN ('Venta','Alquiler')";
            }

            // Tipo propiedad
            if ($tipoPropiedad) {
                $where[] = 'p.tipo_propiedad = ?';
                $params[] = $tipoPropiedad;
            }
            // Subtipo propiedad
            if ($subtipoPropiedad) {
                $where[] = 'p.sub_tipo_propiedad LIKE ?';
                $params[] = '%' . $subtipoPropiedad . '%';
            }
            // Ciudad (para reporte estadisticasM2)
            if ($ciudad) {
                $where[] = 'p.ciudad = ?';
                $params[] = $ciudad;
            }

            // CLA: se resuelven las oficinas que pertenecen al CLA
            if ($claId && !$oficinaId) {
                $oficinas = $this->resolverOficinas($pdo, $claId);
                if (empty($oficinas)) {
                    return ['success' => true, 'ladosIds' => ''];
                }
                $oficinaIds = array_column($oficinas, 'id');
                $placeholders = implode(',', array_fill(0, count($oficinaIds), '?'));
                $where[] = "l.oficina_id IN ($placeholders)";
                $params = array_merge($params, $oficinaIds);
            } elseif ($oficinaId) {
                $where[] = 'l.oficina_id = ?';
                $params[] = $oficinaId;
            }

            // Construir consulta según el reporte y tipo de selección
            $sql = "SELECT GROUP_CONCAT(DISTINCT l.id) AS lados_ids 
                    FROM lados l 
                    INNER JOIN propiedades p ON p.id = l.propiedad_id 
                    WHERE " . implode(' AND ', $where);

            switch ($reporte) {
                case 'ladosPorTipoOperacion':
                    if ($tipoSeleccion === 'columna') {
                        // Ya se agregó oficinaId arriba
                    } elseif ($tipoSeleccion === 'fila') {
                        $where[] = 'p.tipo_operacion = ?';
                        $params[] = $identificador;
                    }
                    break;

                case 'ladosPorAsesor':
                    if ($tipoSeleccion === 'columna') {
                        $where[] = 'l.asesor_id = ?';
                        $params[] = $identificador;
                    } elseif ($tipoSeleccion === 'fila') {
                        $tipoLado = $identificador === 'Captador (Obtención)' ? 'obtencion' : 'cierre';
                        $where[] = 'l.tipo_lado = ?';
                        $params[] = $tipoLado;
                    }
                    break;

                case 'ladosPorOficina':
                    if ($tipoSeleccion === 'columna') {
                        $where[] = 'l.oficina_id = ?';
                        $params[] = $identificador;
                    } elseif ($tipoSeleccion === 'fila') {
                        $tipoLado = $identificador === 'Captador (Obtención)' ? 'obtencion' : 'cierre';
                        $where[] = 'l.tipo_lado = ?';
                        $params[] = $tipoLado;
                    }
                    break;

                case 'rangoPrecios':
                    if ($tipoSeleccion === 'columna') {
                        $rangos = [
                            '< 2500'       => ['min' => null, 'max' => 2500],
                            '2500-5000'    => ['min' => 2500, 'max' => 5000],
                            '5000-10000'   => ['min' => 5000, 'max' => 10000],
                            '10000-25000'  => ['min' => 10000, 'max' => 25000],
                            '25000-50000'  => ['min' => 25000, 'max' => 50000],
                            '50000-100000' => ['min' => 50000, 'max' => 100000],
                            '100000-250000'=> ['min' => 100000, 'max' => 250000],
                            '250000-500000'=> ['min' => 250000, 'max' => 500000],
                            '> 500000'     => ['min' => 500000, 'max' => null]
                        ];
                        $rango = $rangos[$identificador] ?? null;
                        if ($rango) {
                            $precioExpr = "COALESCE(NULLIF(p.precio_venta, 0), NULLIF(p.precio_renta, 0))";
                            if ($rango['min'] === null) {
                                $where[] = "$precioExpr < ?";
                                $params[] = $rango['max'];
                            } elseif ($rango['max'] === null) {
                                $where[] = "$precioExpr >= ?";
                                $params[] = $rango['min'];
                            } else {
                                $where[] = "$precioExpr >= ? AND $precioExpr < ?";
                                $params[] = $rango['min'];
                                $params[] = $rango['max'];
                            }
                        }
                    } elseif ($tipoSeleccion === 'fila') {
                        $where[] = 'p.sub_tipo_propiedad = ?';
                        $params[] = $identificador;
                    }
                    break;

                case 'estadisticasM2':
                case 'estadisticasM2Cla':
                    // En estos reportes solo hay botón "Ver detalle" por urbanización
                    $where[] = 'p.urbanizacion = ?';
                    $params[] = $identificador;
                    break;

                default:
                    return ['success' => false, 'error' => 'Reporte no soportado'];
            }

            // Reconstruir consulta con todas las condiciones añadidas
            $sqlFinal = "SELECT GROUP_CONCAT(DISTINCT l.id) AS lados_ids 
                        FROM lados l 
                        INNER JOIN propiedades p ON p.id = l.propiedad_id 
                        WHERE " . implode(' AND ', $where);
            $sth = $pdo->prepare($sqlFinal);
            $sth->execute($params);
            $row = $sth->fetch(\PDO::FETCH_ASSOC);
            $ladosIds = $row['lados_ids'] ?? '';

            return ['success' => true, 'ladosIds' => $ladosIds];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function postActionGetPropiedadesPorLados($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            
            // Leer parámetros del cuerpo de la petición (JSON)
            $body = json_decode(file_get_contents('php://input'), true);
            $ladosIds = $body['ladosIds'] ?? null;
            $pagina = (int)($body['pagina'] ?? 1);
            $porPagina = (int)($body['porPagina'] ?? 25);
            
            if (empty($ladosIds)) {
                return ['success' => false, 'error' => 'No se proporcionaron IDs de lados.'];
            }
            if (is_string($ladosIds)) {
                $ladosIds = explode(',', $ladosIds);
            }
            $total = count($ladosIds);
            
            $offset = ($pagina - 1) * $porPagina;
            $idsPagina = array_slice($ladosIds, $offset, $porPagina);
            
            if (empty($idsPagina)) {
                return ['success' => true, 'data' => [], 'total' => $total, 'pagina' => $pagina, 'porPagina' => $porPagina];
            }
            
            $placeholders = implode(',', array_fill(0, count($idsPagina), '?'));
            $sql = "SELECT 
                        l.id AS lado_id,
                        p.id AS propiedad_id,
                        CONCAT_WS(', ', p.numero, p.calle, p.urbanizacion, p.municipio, p.ciudad, p.estado) AS direccion,
                        l.tipo_lado,
                        p.tipo_operacion,
                        t.name AS oficina_nombre,
                        CONCAT(u.first_name, ' ', u.last_name) AS asesor_nombre,
                        p.tipo_propiedad,
                        p.sub_tipo_propiedad,
                        COALESCE(NULLIF(p.precio_venta, 0), NULLIF(p.precio_renta, 0)) AS precio_inicial,
                        p.precio_cierre,
                        p.m2_c AS area_construccion,
                        CASE WHEN p.m2_c > 0 THEN p.precio_cierre / p.m2_c ELSE NULL END AS precio_por_m2
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    LEFT JOIN team t ON t.id = l.oficina_id
                    LEFT JOIN user u ON u.id = l.asesor_id
                    WHERE l.id IN ($placeholders)
                    ORDER BY p.id";
            $sth = $pdo->prepare($sql);
            $sth->execute($idsPagina);
            $rows = $sth->fetchAll(\PDO::FETCH_ASSOC);
            
            return [
                'success' => true,
                'data' => $rows,
                'total' => $total,
                'pagina' => $pagina,
                'porPagina' => $porPagina
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getActionGetSubtiposPorTipo($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $tipoPropiedad = $request->get('tipoPropiedad');
            if (!$tipoPropiedad) {
                return ['success' => true, 'data' => []];
            }
            $sql = "SELECT DISTINCT sub_tipo_propiedad 
                    FROM propiedades 
                    WHERE tipo_propiedad = ? 
                    AND deleted = 0 
                    AND sub_tipo_propiedad IS NOT NULL 
                    AND sub_tipo_propiedad != ''
                    ORDER BY sub_tipo_propiedad ASC";
            $sth = $pdo->prepare($sql);
            $sth->execute([$tipoPropiedad]);
            $subtipos = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $subtipos[] = $row['sub_tipo_propiedad'];
            }
            return ['success' => true, 'data' => $subtipos];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getActionGetLadosPorAsesor($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $claId = $request->get('claId');
            $oficinaId = $request->get('oficinaId');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');

            if ($fechaInicio && $fechaFin && $fechaInicio > $fechaFin) {
                return ['success' => false, 'error' => 'La fecha de inicio no puede ser mayor a la fecha fin.'];
            }

            // Obtener asesores según CLA, oficina y fechas
            $asesores = $this->resolverAsesores($pdo, $claId, $oficinaId, $fechaInicio, $fechaFin);

            if (empty($asesores)) {
                return [
                    'success'           => true,
                    'asesores'          => [],
                    'filas'             => $this->filasPorDefectoAsesor([]),
                    'totalesPorAsesor'  => [],
                    'totalGeneral'      => 0,
                ];
            }

            $asesorIds = array_column($asesores, 'id');

            $whereClauses = [];
            $bindParams = [];

            if ($fechaInicio && $fechaFin) {
                $whereClauses[] = "p.fecha_cierre BETWEEN ? AND ?";
                $bindParams[] = $fechaInicio;
                $bindParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $whereClauses[] = "p.fecha_cierre >= ?";
                $bindParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $whereClauses[] = "p.fecha_cierre <= ?";
                $bindParams[] = $fechaFin;
            } else {
                return ['success' => false, 'error' => 'Debe especificar al menos un rango de fechas.'];
            }

            if ($oficinaId) {
                $whereClauses[] = "l.oficina_id = ?";
                $bindParams[] = $oficinaId;
            }

            $placeholders = implode(',', array_fill(0, count($asesorIds), '?'));
            $whereClauses[] = "l.asesor_id IN ($placeholders)";
            $bindParams = array_merge($bindParams, $asesorIds);

            $whereSql = implode(' AND ', $whereClauses);

            $sql = "SELECT
                        l.asesor_id               AS asesor_id,
                        l.tipo_lado               AS tipo_lado,
                        COUNT(l.id)               AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0
                    AND p.deleted = 0
                    AND l.asesor_id IS NOT NULL
                    AND l.tipo_lado IN ('obtencion', 'cierre')
                    AND $whereSql
                    GROUP BY l.asesor_id, l.tipo_lado";

            $sth = $pdo->prepare($sql);
            $sth->execute($bindParams);

            $matriz = [
                'obtencion' => [],
                'cierre'    => [],
            ];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $tipo = $row['tipo_lado'];
                $matriz[$tipo][$row['asesor_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorAsesor = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteosPorAsesor) {
                $totalFila = 0;
                $conteos = [];
                foreach ($asesores as $as) {
                    $n = $conteosPorAsesor[$as['id']] ?? 0;
                    $conteos[$as['id']] = $n;
                    $totalFila += $n;
                    $totalesPorAsesor[$as['id']] = ($totalesPorAsesor[$as['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;

                $nombreTipo = $tipo === 'obtencion' ? 'Captador (Obtención)' : 'Cerrador (Cierre)';
                $filas[] = [
                    'tipo'    => $nombreTipo,
                    'conteos' => $conteos,
                    'total'   => $totalFila,
                ];
            }

            // Ordenar asesores por total descendente y eliminar los que tienen total 0
            $asesoresFiltrados = [];
            foreach ($asesores as $as) {
                if (($totalesPorAsesor[$as['id']] ?? 0) > 0) {
                    $asesoresFiltrados[] = $as;
                }
            }
            usort($asesoresFiltrados, function($a, $b) use ($totalesPorAsesor) {
                $totalA = $totalesPorAsesor[$a['id']] ?? 0;
                $totalB = $totalesPorAsesor[$b['id']] ?? 0;
                return $totalB - $totalA;
            });

            return [
                'success'           => true,
                'asesores'          => $asesoresFiltrados,
                'filas'             => $filas,
                'totalesPorAsesor'  => $totalesPorAsesor,
                'totalGeneral'      => $totalGeneral,
            ];

        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    protected function resolverAsesores($pdo, $claId, $oficinaId = null, $fechaInicio = null, $fechaFin = null)
    {
        // Si hay oficina, obtener asesores directamente desde lados (con opción de filtro por CLA)
        if ($oficinaId) {
            $sql = "SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name
                    FROM user u
                    INNER JOIN lados l ON l.asesor_id = u.id
                    WHERE l.deleted = 0
                    AND l.oficina_id = ?
                    AND u.deleted = 0";
            $params = [$oficinaId];

            if ($claId) {
                // Limitar a usuarios que pertenecen al CLA
                $sql .= " AND EXISTS (SELECT 1 FROM team_user tu WHERE tu.user_id = u.id AND tu.team_id = ? AND tu.deleted = 0)";
                $params[] = $claId;
            }

            // Opcional: filtrar por fechas de cierre de la propiedad (para que los asesores solo aparezcan si tienen lados en el período)
            if ($fechaInicio && $fechaFin) {
                $sql .= " AND EXISTS (SELECT 1 FROM lados l2 INNER JOIN propiedades p ON p.id = l2.propiedad_id WHERE l2.asesor_id = u.id AND l2.oficina_id = ? AND p.fecha_cierre BETWEEN ? AND ?)";
                $params[] = $oficinaId;
                $params[] = $fechaInicio;
                $params[] = $fechaFin;
            } elseif ($fechaInicio) {
                $sql .= " AND EXISTS (SELECT 1 FROM lados l2 INNER JOIN propiedades p ON p.id = l2.propiedad_id WHERE l2.asesor_id = u.id AND l2.oficina_id = ? AND p.fecha_cierre >= ?)";
                $params[] = $oficinaId;
                $params[] = $fechaInicio;
            } elseif ($fechaFin) {
                $sql .= " AND EXISTS (SELECT 1 FROM lados l2 INNER JOIN propiedades p ON p.id = l2.propiedad_id WHERE l2.asesor_id = u.id AND l2.oficina_id = ? AND p.fecha_cierre <= ?)";
                $params[] = $oficinaId;
                $params[] = $fechaFin;
            }

            $sql .= " ORDER BY name ASC";
            $sth = $pdo->prepare($sql);
            $sth->execute($params);
        } else {
            // Sin oficina: obtener asesores por CLA o todos los que tienen lados
            $sql = "SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name
                    FROM user u";
            $where = [];
            $params = [];

            if ($claId) {
                $sql .= " INNER JOIN team_user tu ON tu.user_id = u.id AND tu.team_id = ? AND tu.deleted = 0";
                $params[] = $claId;
            } else {
                // Si no hay CLA, solo usuarios que tienen al menos un lado
                $sql .= " INNER JOIN lados l ON l.asesor_id = u.id";
            }

            $where[] = "u.deleted = 0";
            if (!$claId) {
                $where[] = "l.deleted = 0";
            }
            $sql .= " WHERE " . implode(' AND ', $where);
            $sql .= " ORDER BY name ASC";
            $sth = $pdo->prepare($sql);
            $sth->execute($params);
        }

        $asesores = [];
        while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
            if ($row['name'] && trim($row['name']) !== '') {
                $asesores[] = ['id' => $row['id'], 'name' => $row['name']];
            }
        }
        return $asesores;
    }

    protected function filasPorDefectoAsesor(array $asesores)
    {
        $conteos = [];
        foreach ($asesores as $as) {
            $conteos[$as['id']] = 0;
        }
        return [
            ['tipo' => 'Captador (Obtención)', 'conteos' => $conteos, 'total' => 0],
            ['tipo' => 'Cerrador (Cierre)',    'conteos' => $conteos, 'total' => 0],
        ];
    }

    public function getActionGetLadosPorOficina($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $claId = $request->get('claId');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');

            // Validar fechas
            if ($fechaInicio && $fechaFin && $fechaInicio > $fechaFin) {
                return ['success' => false, 'error' => 'La fecha de inicio no puede ser mayor a la fecha fin.'];
            }

            // Obtener oficinas según CLA
            $oficinas = $this->resolverOficinas($pdo, $claId);

            if (empty($oficinas)) {
                return [
                    'success'           => true,
                    'oficinas'          => [],
                    'filas'             => $this->filasPorDefectoOficina([]),
                    'totalesPorOficina' => [],
                    'totalGeneral'      => 0,
                ];
            }

            $oficinaIds = array_column($oficinas, 'id');

            // Construir condiciones WHERE
            $whereClauses = [];
            $bindParams = [];

            // Fechas
            if ($fechaInicio && $fechaFin) {
                $whereClauses[] = "p.fecha_cierre BETWEEN ? AND ?";
                $bindParams[] = $fechaInicio;
                $bindParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $whereClauses[] = "p.fecha_cierre >= ?";
                $bindParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $whereClauses[] = "p.fecha_cierre <= ?";
                $bindParams[] = $fechaFin;
            } else {
                return ['success' => false, 'error' => 'Debe especificar al menos un rango de fechas.'];
            }

            // Oficinas
            $placeholders = implode(',', array_fill(0, count($oficinaIds), '?'));
            $whereClauses[] = "l.oficina_id IN ($placeholders)";
            $bindParams = array_merge($bindParams, $oficinaIds); // orden correcto: fechas luego oficinas

            $whereSql = implode(' AND ', $whereClauses);

            $sql = "SELECT
                        l.oficina_id              AS oficina_id,
                        l.tipo_lado               AS tipo_lado,
                        COUNT(l.id)               AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted = 0
                    AND p.deleted = 0
                    AND l.oficina_id IS NOT NULL
                    AND l.tipo_lado IN ('obtencion', 'cierre')
                    AND $whereSql
                    GROUP BY l.oficina_id, l.tipo_lado";

            $sth = $pdo->prepare($sql);
            $sth->execute($bindParams);

            $matriz = [
                'obtencion' => [],
                'cierre'    => [],
            ];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $tipo = $row['tipo_lado'];
                $matriz[$tipo][$row['oficina_id']] = (int)$row['total'];
            }

            $filas = [];
            $totalesPorOficina = [];
            $totalGeneral = 0;

            foreach ($matriz as $tipo => $conteosPorOficina) {
                $totalFila = 0;
                $conteos = [];
                foreach ($oficinas as $of) {
                    $n = $conteosPorOficina[$of['id']] ?? 0;
                    $conteos[$of['id']] = $n;
                    $totalFila += $n;
                    $totalesPorOficina[$of['id']] = ($totalesPorOficina[$of['id']] ?? 0) + $n;
                }
                $totalGeneral += $totalFila;

                $nombreTipo = $tipo === 'obtencion' ? 'Captador (Obtención)' : 'Cerrador (Cierre)';
                $filas[] = [
                    'tipo'    => $nombreTipo,
                    'conteos' => $conteos,
                    'total'   => $totalFila,
                ];
            }

            // Ordenar oficinas por total de lados descendente
            usort($oficinas, function($a, $b) use ($totalesPorOficina) {
                $totalA = $totalesPorOficina[$a['id']] ?? 0;
                $totalB = $totalesPorOficina[$b['id']] ?? 0;
                return $totalB - $totalA;
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

    protected function filasPorDefectoOficina(array $oficinas)
    {
        $conteos = [];
        foreach ($oficinas as $of) {
            $conteos[$of['id']] = 0;
        }
        return [
            ['tipo' => 'Captador (Obtención)', 'conteos' => $conteos, 'total' => 0],
            ['tipo' => 'Cerrador (Cierre)',    'conteos' => $conteos, 'total' => 0],
        ];
    }

    public function getActionGetCiudades($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $sql = "SELECT DISTINCT ciudad 
                    FROM propiedades 
                    WHERE deleted = 0 
                    AND ciudad IS NOT NULL 
                    AND ciudad != ''
                    ORDER BY ciudad ASC";
            $sth = $pdo->prepare($sql);
            $sth->execute();
            $ciudades = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $ciudades[] = $row['ciudad'];
            }
            return ['success' => true, 'data' => $ciudades];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getActionGetEstadisticasMercadoPorM2($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $ciudad = $request->get('ciudad');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');
            $tipoOperacion = $request->get('tipoOperacion');
            $tipoPropiedad = $request->get('tipoPropiedad');
            $subtipoPropiedad = $request->get('subtipoPropiedad');

            if (!$ciudad) {
                return ['success' => false, 'error' => 'Debe seleccionar una ciudad.'];
            }

            if ($fechaInicio && $fechaFin && $fechaInicio > $fechaFin) {
                return ['success' => false, 'error' => 'La fecha de inicio no puede ser mayor a la fecha fin.'];
            }

            // Obtener todas las urbanizaciones con al menos un lado en el período (para evitar mostrar ceros)
            $sqlUrban = "SELECT DISTINCT p.urbanizacion 
                        FROM propiedades p
                        INNER JOIN lados l ON l.propiedad_id = p.id
                        WHERE p.deleted = 0 
                        AND p.ciudad = ? 
                        AND p.urbanizacion IS NOT NULL 
                        AND p.urbanizacion != ''
                        AND l.deleted = 0";
            $paramsUrban = [$ciudad];
            if ($fechaInicio && $fechaFin) {
                $sqlUrban .= " AND p.fecha_cierre BETWEEN ? AND ?";
                $paramsUrban[] = $fechaInicio;
                $paramsUrban[] = $fechaFin;
            } elseif ($fechaInicio) {
                $sqlUrban .= " AND p.fecha_cierre >= ?";
                $paramsUrban[] = $fechaInicio;
            } elseif ($fechaFin) {
                $sqlUrban .= " AND p.fecha_cierre <= ?";
                $paramsUrban[] = $fechaFin;
            }
            if ($tipoOperacion) {
                $sqlUrban .= " AND p.tipo_operacion = ?";
                $paramsUrban[] = $tipoOperacion;
            } else {
                $sqlUrban .= " AND p.tipo_operacion IN ('Venta','Alquiler')";
            }
            if ($tipoPropiedad) {
                $sqlUrban .= " AND p.tipo_propiedad = ?";
                $paramsUrban[] = $tipoPropiedad;
            }
            if ($subtipoPropiedad) {
                $sqlUrban .= " AND p.sub_tipo_propiedad LIKE ?";
                $paramsUrban[] = '%' . $subtipoPropiedad . '%';
            }
            $sqlUrban .= " ORDER BY p.urbanizacion ASC";

            $sthUrban = $pdo->prepare($sqlUrban);
            $sthUrban->execute($paramsUrban);
            $urbanizaciones = [];
            while ($row = $sthUrban->fetch(\PDO::FETCH_ASSOC)) {
                $urbanizaciones[] = $row['urbanizacion'];
            }

            if (empty($urbanizaciones)) {
                return [
                    'success' => true,
                    'urbanizaciones' => [],
                    'filas' => [],
                    'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]
                ];
            }

            // Construir condiciones adicionales (sin duplicar ciudad, ya está en el JOIN)
            $extraConditions = [];
            $extraParams = [];

            if ($fechaInicio && $fechaFin) {
                $extraConditions[] = "p.fecha_cierre BETWEEN ? AND ?";
                $extraParams[] = $fechaInicio;
                $extraParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $extraConditions[] = "p.fecha_cierre >= ?";
                $extraParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $extraConditions[] = "p.fecha_cierre <= ?";
                $extraParams[] = $fechaFin;
            }

            if ($tipoOperacion) {
                $extraConditions[] = "p.tipo_operacion = ?";
                $extraParams[] = $tipoOperacion;
            } else {
                $extraConditions[] = "p.tipo_operacion IN ('Venta','Alquiler')";
            }

            if ($tipoPropiedad) {
                $extraConditions[] = "p.tipo_propiedad = ?";
                $extraParams[] = $tipoPropiedad;
            }

            if ($subtipoPropiedad) {
                $extraConditions[] = "p.sub_tipo_propiedad LIKE ?";
                $extraParams[] = '%' . $subtipoPropiedad . '%';
            }

            $extraSql = implode(' AND ', $extraConditions);
            $placeholders = implode(',', array_fill(0, count($urbanizaciones), '?'));

            $sqlDatos = "SELECT 
                            p.urbanizacion,
                            COUNT(DISTINCT l.id) AS lados_count,
                            AVG(CASE WHEN p.precio_cierre > 0 THEN p.precio_cierre END) AS avg_price,
                            AVG(p.m2_c) AS avg_m2,
                            AVG(CASE WHEN p.precio_cierre > 0 AND p.m2_c > 0 THEN p.precio_cierre / p.m2_c END) AS avg_price_m2
                        FROM propiedades p
                        LEFT JOIN lados l ON l.propiedad_id = p.id AND l.deleted = 0
                        WHERE p.deleted = 0
                        AND p.ciudad = ?
                        AND p.urbanizacion IN ($placeholders)
                        AND $extraSql
                        GROUP BY p.urbanizacion";

            $bindParams = [$ciudad];
            $bindParams = array_merge($bindParams, $urbanizaciones);
            $bindParams = array_merge($bindParams, $extraParams);

            $sth = $pdo->prepare($sqlDatos);
            $sth->execute($bindParams);

            $datos = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $datos[$row['urbanizacion']] = [
                    'lados' => (int)$row['lados_count'],
                    'avg_price' => $row['avg_price'] ? round($row['avg_price'], 2) : null,
                    'avg_m2' => $row['avg_m2'] ? round($row['avg_m2'], 2) : null,
                    'avg_price_m2' => $row['avg_price_m2'] ? round($row['avg_price_m2'], 2) : null,
                ];
            }

            $filas = [];
            foreach ($urbanizaciones as $urb) {
                $fila = $datos[$urb] ?? ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
                // Solo incluir si tiene al menos un lado
                if ($fila['lados'] > 0) {
                    $filas[] = [
                        'urbanizacion' => $urb,
                        'lados' => $fila['lados'],
                        'avg_price' => $fila['avg_price'],
                        'avg_m2' => $fila['avg_m2'],
                        'avg_price_m2' => $fila['avg_price_m2'],
                    ];
                }
            }

            // Ordenar por lados descendente
            usort($filas, function($a, $b) {
                return $b['lados'] - $a['lados'];
            });

            // Totales generales (solo sobre las filas mostradas)
            $totales = ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
            $precios = []; $m2s = []; $preciosM2 = [];
            foreach ($filas as $f) {
                $totales['lados'] += $f['lados'];
                if ($f['avg_price'] !== null) $precios[] = $f['avg_price'];
                if ($f['avg_m2'] !== null) $m2s[] = $f['avg_m2'];
                if ($f['avg_price_m2'] !== null) $preciosM2[] = $f['avg_price_m2'];
            }
            $totales['avg_price'] = !empty($precios) ? round(array_sum($precios) / count($precios), 2) : null;
            $totales['avg_m2'] = !empty($m2s) ? round(array_sum($m2s) / count($m2s), 2) : null;
            $totales['avg_price_m2'] = !empty($preciosM2) ? round(array_sum($preciosM2) / count($preciosM2), 2) : null;

            return [
                'success' => true,
                'urbanizaciones' => array_column($filas, 'urbanizacion'),
                'filas' => $filas,
                'totales' => $totales,
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function getActionGetEstadisticasM2PorCLA($params, $data, $request)
    {
        try {
            $pdo = $this->getPDO();
            $claId = $request->get('claId');
            $oficinaId = $request->get('oficinaId');
            $fechaInicio = $request->get('fechaInicio');
            $fechaFin = $request->get('fechaFin');
            $tipoOperacion = $request->get('tipoOperacion');
            $tipoPropiedad = $request->get('tipoPropiedad');
            $subtipoPropiedad = $request->get('subtipoPropiedad');

            if (!$claId) {
                return ['success' => false, 'error' => 'Debe seleccionar un CLA.'];
            }

            if ($fechaInicio && $fechaFin && $fechaInicio > $fechaFin) {
                return ['success' => false, 'error' => 'La fecha de inicio no puede ser mayor a la fecha fin.'];
            }

            // Obtener usuarios del CLA (y oficina)
            $sqlUsers = "SELECT DISTINCT u.id 
                        FROM user u
                        INNER JOIN team_user tu ON tu.user_id = u.id
                        WHERE tu.team_id = ? AND tu.deleted = 0";
            $paramsUsers = [$claId];
            if ($oficinaId) {
                $sqlUsers .= " AND EXISTS (SELECT 1 FROM team_user tu2 WHERE tu2.user_id = u.id AND tu2.team_id = ? AND tu2.deleted = 0)";
                $paramsUsers[] = $oficinaId;
            }
            $sthUsers = $pdo->prepare($sqlUsers);
            $sthUsers->execute($paramsUsers);
            $userIds = [];
            while ($row = $sthUsers->fetch(\PDO::FETCH_ASSOC)) {
                $userIds[] = $row['id'];
            }
            if (empty($userIds)) {
                return [
                    'success' => true,
                    'urbanizaciones' => [],
                    'filas' => [],
                    'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]
                ];
            }

            // Obtener urbanizaciones con al menos un lado de esos usuarios
            $placeholdersUsers = implode(',', array_fill(0, count($userIds), '?'));
            $sqlUrban = "SELECT DISTINCT p.urbanizacion 
                        FROM propiedades p
                        INNER JOIN lados l ON l.propiedad_id = p.id
                        WHERE l.asesor_id IN ($placeholdersUsers)
                        AND l.deleted = 0
                        AND p.deleted = 0
                        AND p.urbanizacion IS NOT NULL 
                        AND p.urbanizacion != ''";
            $paramsUrban = $userIds;

            if ($fechaInicio && $fechaFin) {
                $sqlUrban .= " AND p.fecha_cierre BETWEEN ? AND ?";
                $paramsUrban[] = $fechaInicio;
                $paramsUrban[] = $fechaFin;
            } elseif ($fechaInicio) {
                $sqlUrban .= " AND p.fecha_cierre >= ?";
                $paramsUrban[] = $fechaInicio;
            } elseif ($fechaFin) {
                $sqlUrban .= " AND p.fecha_cierre <= ?";
                $paramsUrban[] = $fechaFin;
            }
            if ($tipoOperacion) {
                $sqlUrban .= " AND p.tipo_operacion = ?";
                $paramsUrban[] = $tipoOperacion;
            } else {
                $sqlUrban .= " AND p.tipo_operacion IN ('Venta','Alquiler')";
            }
            if ($tipoPropiedad) {
                $sqlUrban .= " AND p.tipo_propiedad = ?";
                $paramsUrban[] = $tipoPropiedad;
            }
            if ($subtipoPropiedad) {
                $sqlUrban .= " AND p.sub_tipo_propiedad LIKE ?";
                $paramsUrban[] = '%' . $subtipoPropiedad . '%';
            }
            $sqlUrban .= " ORDER BY p.urbanizacion ASC";

            $sthUrban = $pdo->prepare($sqlUrban);
            $sthUrban->execute($paramsUrban);
            $urbanizaciones = [];
            while ($row = $sthUrban->fetch(\PDO::FETCH_ASSOC)) {
                $urbanizaciones[] = $row['urbanizacion'];
            }

            if (empty($urbanizaciones)) {
                return [
                    'success' => true,
                    'urbanizaciones' => [],
                    'filas' => [],
                    'totales' => ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null]
                ];
            }

            // Construir condiciones adicionales
            $extraConditions = [];
            $extraParams = [];

            if ($fechaInicio && $fechaFin) {
                $extraConditions[] = "p.fecha_cierre BETWEEN ? AND ?";
                $extraParams[] = $fechaInicio;
                $extraParams[] = $fechaFin;
            } elseif ($fechaInicio) {
                $extraConditions[] = "p.fecha_cierre >= ?";
                $extraParams[] = $fechaInicio;
            } elseif ($fechaFin) {
                $extraConditions[] = "p.fecha_cierre <= ?";
                $extraParams[] = $fechaFin;
            }

            if ($tipoOperacion) {
                $extraConditions[] = "p.tipo_operacion = ?";
                $extraParams[] = $tipoOperacion;
            } else {
                $extraConditions[] = "p.tipo_operacion IN ('Venta','Alquiler')";
            }

            if ($tipoPropiedad) {
                $extraConditions[] = "p.tipo_propiedad = ?";
                $extraParams[] = $tipoPropiedad;
            }

            if ($subtipoPropiedad) {
                $extraConditions[] = "p.sub_tipo_propiedad LIKE ?";
                $extraParams[] = '%' . $subtipoPropiedad . '%';
            }

            $extraSql = implode(' AND ', $extraConditions);
            $placeholdersUrb = implode(',', array_fill(0, count($urbanizaciones), '?'));

            $sqlDatos = "SELECT 
                            p.urbanizacion,
                            COUNT(DISTINCT l.id) AS lados_count,
                            AVG(CASE WHEN p.precio_cierre > 0 THEN p.precio_cierre END) AS avg_price,
                            AVG(p.m2_c) AS avg_m2,
                            AVG(CASE WHEN p.precio_cierre > 0 AND p.m2_c > 0 THEN p.precio_cierre / p.m2_c END) AS avg_price_m2
                        FROM propiedades p
                        INNER JOIN lados l ON l.propiedad_id = p.id
                        WHERE l.asesor_id IN ($placeholdersUsers)
                        AND l.deleted = 0
                        AND p.deleted = 0
                        AND p.urbanizacion IN ($placeholdersUrb)
                        AND $extraSql
                        GROUP BY p.urbanizacion";

            $bindParams = array_merge($userIds, $urbanizaciones, $extraParams);
            $sth = $pdo->prepare($sqlDatos);
            $sth->execute($bindParams);

            $datos = [];
            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $datos[$row['urbanizacion']] = [
                    'lados' => (int)$row['lados_count'],
                    'avg_price' => $row['avg_price'] ? round($row['avg_price'], 2) : null,
                    'avg_m2' => $row['avg_m2'] ? round($row['avg_m2'], 2) : null,
                    'avg_price_m2' => $row['avg_price_m2'] ? round($row['avg_price_m2'], 2) : null,
                ];
            }

            $filas = [];
            foreach ($urbanizaciones as $urb) {
                $fila = $datos[$urb] ?? ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
                if ($fila['lados'] > 0) {
                    $filas[] = [
                        'urbanizacion' => $urb,
                        'lados' => $fila['lados'],
                        'avg_price' => $fila['avg_price'],
                        'avg_m2' => $fila['avg_m2'],
                        'avg_price_m2' => $fila['avg_price_m2'],
                    ];
                }
            }

            usort($filas, function($a, $b) {
                return $b['lados'] - $a['lados'];
            });

            $totales = ['lados' => 0, 'avg_price' => null, 'avg_m2' => null, 'avg_price_m2' => null];
            $precios = []; $m2s = []; $preciosM2 = [];
            foreach ($filas as $f) {
                $totales['lados'] += $f['lados'];
                if ($f['avg_price'] !== null) $precios[] = $f['avg_price'];
                if ($f['avg_m2'] !== null) $m2s[] = $f['avg_m2'];
                if ($f['avg_price_m2'] !== null) $preciosM2[] = $f['avg_price_m2'];
            }
            $totales['avg_price'] = !empty($precios) ? round(array_sum($precios) / count($precios), 2) : null;
            $totales['avg_m2'] = !empty($m2s) ? round(array_sum($m2s) / count($m2s), 2) : null;
            $totales['avg_price_m2'] = !empty($preciosM2) ? round(array_sum($preciosM2) / count($preciosM2), 2) : null;

            return [
                'success' => true,
                'urbanizaciones' => array_column($filas, 'urbanizacion'),
                'filas' => $filas,
                'totales' => $totales,
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}