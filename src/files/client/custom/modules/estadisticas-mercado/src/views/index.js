// estadisticas-mercado/src/views/index.js
define('estadisticas-mercado:views/index', ['view'], function (View) {
    return View.extend({

        template: 'estadisticas-mercado:index',

        events: {
            'click [data-action="irReporte"]': function (e) {
                var reporte = $(e.currentTarget).data('reporte');
                if (!reporte) return;

                var rutas = {
                        ladosPorTipoOperacion: '#EstadisticasMercado/ladosPorTipoOperacion',
                        rangoPrecios: '#EstadisticasMercado/rangoPrecios',
                        tiposLadoPorAsesor: '#EstadisticasMercado/tiposLadoPorAsesor',
                        tiposLadoPorOficina: '#EstadisticasMercado/tiposLadoPorOficina',
                        estadisticasM2: '#EstadisticasMercado/estadisticasM2',
                        estadisticasM2Cla: '#EstadisticasMercado/estadisticasM2Cla'
                };

                var ruta = rutas[reporte];
                if (ruta) {
                    this.getRouter().navigate(ruta, { trigger: true });
                } else {
                    Espo.Ui.info('Este reporte estará disponible próximamente.');
                }
            }
        },

        setup: function () {
            // nada extra por ahora
        },

        afterRender: function () {
            // Marcar cards "próximamente" como no clickeables visualmente
            this.$el.find('.em-card-pronto').css({
                'opacity': '0.55',
                'cursor': 'not-allowed'
            }).off('click').on('click', function () {
                Espo.Ui.info('Este reporte estará disponible próximamente.');
            });
        }

    });
});
