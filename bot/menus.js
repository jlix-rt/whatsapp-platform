module.exports = {
  mainMenu() {
    return {
      type: 'list',
      body: { text: '¿Qué deseas hacer?' },
      action: {
        button: 'Seleccionar',
        sections: [
          {
            title: 'Opciones',
            rows: [
              {
                id: 'ORDER',
                title: '🛒 Hacer pedido',
                description: 'Ver productos disponibles'
              },
              {
                id: 'HUMAN',
                title: '👤 Hablar con una persona',
                description: 'Atención personalizada'
              }
            ]
          }
        ]
      }
    };
  },

  productMenu() {
    return {
      type: 'list',
      body: { text: 'Selecciona un producto:' },
      action: {
        button: 'Ver productos',
        sections: [{
          title: 'Productos',
          rows: [
            { id: 'PATITAS', title: '🐾 Patitas de pollo', description: 'Desde Q32.00' },
            { id: 'PULMON', title: '🫁 Pulmón de res', description: 'Desde Q30.00' },
            { id: 'OREJAS', title: '👂 Orejas de res', description: 'Desde Q30.00' },
            { id: 'TRAQUEAS', title: '🦴 Tráqueas de res', description: 'Desde Q30.00' },
            { id: 'BULLSTICK', title: '🥩 Bullstick', description: 'Desde Q30.00' }
          ]
        }]
      }
    };
  }
};
