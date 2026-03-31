// estadisticas-mercado/src/views/modules/excel-export.js
//
// Módulo reutilizable de exportación a Excel usando SheetJS (xlsx).
// Uso:
//   define(['estadisticas-mercado:views/modules/excel-export'], function(ExcelExport) {
//     ExcelExport.exportar({
//       nombreArchivo : 'mi_reporte',
//       titulo        : 'Título de la hoja',
//       headers       : ['Col1', 'Col2', 'Total'],
//       filas         : [['A', 1, 1], ['B', 2, 2]],
//       filaTotal     : ['Total', 3, 3]   // opcional
//     });
//   });

define('estadisticas-mercado:views/modules/excel-export', [], function () {

    /**
     * Carga SheetJS de forma lazy la primera vez.
     * En EspoCRM el bundle de xlsx ya suele estar disponible globalmente
     * como window.XLSX; si no, lo importamos desde cdnjs.
     */
    function cargarXLSX(callback) {
        if (window.XLSX) {
            callback(window.XLSX);
            return;
        }
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = function () { callback(window.XLSX); };
        document.head.appendChild(script);
    }

    /**
     * Genera y descarga un archivo .xlsx.
     *
     * @param {Object} opciones
     * @param {string}   opciones.nombreArchivo  - Nombre sin extensión
     * @param {string}   opciones.titulo         - Nombre de la hoja
     * @param {string[]} opciones.headers        - Array de encabezados
     * @param {Array[]}  opciones.filas          - Filas de datos (arrays)
     * @param {Array}    [opciones.filaTotal]    - Fila de totales (opcional)
     * @param {string}   [opciones.subtitulo]    - Texto extra debajo del título (opcional)
     */
    function exportar(opciones) {
        cargarXLSX(function (XLSX) {
            var nombreArchivo = (opciones.nombreArchivo || 'reporte') + '.xlsx';
            var titulo        = opciones.titulo        || 'Reporte';
            var headers       = opciones.headers       || [];
            var filas         = opciones.filas         || [];
            var filaTotal     = opciones.filaTotal     || null;
            var subtitulo     = opciones.subtitulo     || null;

            // ── Construir datos de la hoja ──────────────────────
            var wsData = [];

            // Fila 1: Título
            wsData.push([titulo]);

            // Fila 2: Subtítulo (opcional) o vacía
            if (subtitulo) {
                wsData.push([subtitulo]);
            }

            // Fila vacía separadora
            wsData.push([]);

            // Encabezados
            wsData.push(headers);

            // Filas de datos
            filas.forEach(function (fila) {
                wsData.push(fila);
            });

            // Fila de totales
            if (filaTotal) {
                wsData.push(filaTotal);
            }

            // ── Crear workbook ──────────────────────────────────
            var ws = XLSX.utils.aoa_to_sheet(wsData);

            // Ancho de columnas automático (estimado)
            var colWidths = headers.map(function (h, idx) {
                var maxLen = String(h).length;
                filas.forEach(function (fila) {
                    var val = fila[idx] !== undefined ? String(fila[idx]) : '';
                    if (val.length > maxLen) maxLen = val.length;
                });
                return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
            });
            ws['!cols'] = colWidths;

            // Merge del título a lo ancho de las columnas
            var totalCols = headers.length;
            if (totalCols > 1) {
                ws['!merges'] = ws['!merges'] || [];
                ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
                if (subtitulo) {
                    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });
                }
            }

            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 31));

            XLSX.writeFile(wb, nombreArchivo);
        });
    }

    return { exportar: exportar };
});
