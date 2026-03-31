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
     *   mes  (1-12)
     *   anio (YYYY)
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

            $mes   = $request->get('mes');    // puede ser null → todos los meses
            $anio  = $request->get('anio');   // puede ser null → todos los años
            $claId = $request->get('claId');  // puede ser null → todas las oficinas

            // 1. Obtener lista de oficinas
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

            // 2. Consulta principal: JOIN lados → propiedades filtrado por fechaCierre
            //    tipoOperacion IN ('Venta','Renta') de Propiedades
            //    La oficina viene del campo oficina_id de Lados (FK a Team)

            // Construir filtros dinámicos
            $whereExtra = '';
            $bindParams = [];

            if ($anio) {
                $whereExtra .= " AND YEAR(p.fecha_cierre) = ?";
                $bindParams[] = (int)$anio;
            }
            if ($mes) {
                $whereExtra .= " AND MONTH(p.fecha_cierre) = ?";
                $bindParams[] = (int)$mes;
            }

            // Filtrar solo las oficinas del CLA elegido
            $placeholderOficinas = implode(',', array_fill(0, count($oficinaIds), '?'));

            $sql = "SELECT
                        l.oficina_id                          AS oficina_id,
                        p.tipo_operacion                      AS tipo_operacion,
                        COUNT(l.id)                           AS total
                    FROM lados l
                    INNER JOIN propiedades p ON p.id = l.propiedad_id
                    WHERE l.deleted  = 0
                    AND   p.deleted  = 0
                    AND   p.tipo_operacion IN ('Venta','Renta')
                    AND   p.fecha_cierre IS NOT NULL
                    AND   l.oficina_id IN ($placeholderOficinas)
                    $whereExtra
                    GROUP BY l.oficina_id, p.tipo_operacion";

            $allParams = array_merge($oficinaIds, $bindParams);

            $sth = $pdo->prepare($sql);
            $sth->execute($allParams);

            // 3. Indexar resultados en matriz [tipo][oficinaId] = total
            $matriz = [
                'Venta'    => [],
                'Alquiler' => [],   // mapeamos Renta → Alquiler
            ];

            while ($row = $sth->fetch(\PDO::FETCH_ASSOC)) {
                $tipo = ($row['tipo_operacion'] === 'Renta') ? 'Alquiler' : 'Venta';
                $matriz[$tipo][$row['oficina_id']] = (int)$row['total'];
            }

            // 4. Construir filas y totales
            $filas             = [];
            $totalesPorOficina = [];
            $totalGeneral      = 0;

            foreach ($matriz as $tipo => $conteosPorOficina) {
                $totalFila = 0;
                $conteos   = [];

                foreach ($oficinas as $of) {
                    $n                        = $conteosPorOficina[$of['id']] ?? 0;
                    $conteos[$of['id']]       = $n;
                    $totalFila               += $n;
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
}
