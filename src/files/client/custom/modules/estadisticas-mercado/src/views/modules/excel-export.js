// estadisticas-mercado/src/views/modules/excel-export.js
define('estadisticas-mercado:views/modules/excel-export', [], function () {

    function cargarXLSX(callback) {
        if (window.XLSX) {
            callback(window.XLSX);
            return;
        }
        var script = document.createElement('script');
        script.src = 'client/custom/modules/estadisticas-mercado/lib/xlsx.full.min.js';
        script.onload = function () { callback(window.XLSX); };
        script.onerror = function () {
            Espo.Ui.error('No se pudo cargar la librería XLSX. Verifique la ruta.');
        };
        document.head.appendChild(script);
    }

    function exportar(opciones) {
        cargarXLSX(function (XLSX) {
            var nombreArchivo = (opciones.nombreArchivo || 'reporte') + '.xlsx';
            var titulo        = opciones.titulo        || 'Reporte';
            var headers       = opciones.headers       || [];
            var filas         = opciones.filas         || [];
            var filaTotal     = opciones.filaTotal     || null;
            var subtitulo     = opciones.subtitulo     || null;

            // Datos de la hoja
            var wsData = [
                [titulo],
                subtitulo ? [subtitulo] : [],
                [],
                headers,
                ...filas
            ];
            if (filaTotal) wsData.push(filaTotal);

            var ws = XLSX.utils.aoa_to_sheet(wsData);

            var totalCols = headers.length;
            var tituloRow = 0;
            var subtituloRow = subtitulo ? 1 : -1;
            var headerRow = subtitulo ? 3 : 2;
            var dataStartRow = headerRow + 1;
            var dataEndRow = dataStartRow + filas.length - 1;
            var totalRow = filaTotal ? dataEndRow + 1 : -1;

            // Función para aplicar estilo a una celda
            function setCellStyle(row, col, style) {
                var cellRef = XLSX.utils.encode_cell({ r: row, c: col });
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
                if (!ws[cellRef].s) ws[cellRef].s = {};
                Object.assign(ws[cellRef].s, style);
            }

            // Bordes finos para toda la tabla (encabezado + datos + totales)
            var thinBorder = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
            var mediumTopBorder = {
                top: { style: 'medium' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
            var mediumBottomBorder = {
                top: { style: 'thin' },
                bottom: { style: 'medium' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Aplicar bordes finos a todas las celdas de la tabla (desde headerRow hasta lastRow)
            var lastRow = totalRow !== -1 ? totalRow : dataEndRow;
            for (var r = headerRow; r <= lastRow; r++) {
                for (var c = 0; c < totalCols; c++) {
                    setCellStyle(r, c, { border: thinBorder });
                }
            }

            // Borde superior más grueso en la fila de encabezados
            for (var c = 0; c < totalCols; c++) {
                setCellStyle(headerRow, c, { border: mediumTopBorder });
            }
            // Borde inferior más grueso en la última fila (totales o último dato)
            for (var c = 0; c < totalCols; c++) {
                setCellStyle(lastRow, c, { border: mediumBottomBorder });
            }

            // Negrita en encabezados y totales
            for (var c = 0; c < totalCols; c++) {
                setCellStyle(headerRow, c, { font: { bold: true } });
                if (totalRow !== -1) setCellStyle(totalRow, c, { font: { bold: true } });
            }

            // Fondo gris claro en fila de totales
            if (totalRow !== -1) {
                for (var c = 0; c < totalCols; c++) {
                    setCellStyle(totalRow, c, { fill: { fgColor: { rgb: "F5F5F5" }, patternType: "solid" } });
                }
            }

            // Anchos de columna
            var colWidths = headers.map((h, idx) => {
                var maxLen = String(h).length;
                filas.forEach(fila => {
                    var val = fila[idx] !== undefined ? String(fila[idx]) : '';
                    if (val.length > maxLen) maxLen = val.length;
                });
                return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
            });
            ws['!cols'] = colWidths;

            // Fusionar título y subtítulo
            if (totalCols > 1) {
                ws['!merges'] = ws['!merges'] || [];
                ws['!merges'].push({ s: { r: tituloRow, c: 0 }, e: { r: tituloRow, c: totalCols - 1 } });
                if (subtitulo) {
                    ws['!merges'].push({ s: { r: subtituloRow, c: 0 }, e: { r: subtituloRow, c: totalCols - 1 } });
                }
            }

            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, titulo.substring(0, 31));
            XLSX.writeFile(wb, nombreArchivo);
        });
    }

    return { exportar: exportar };
});