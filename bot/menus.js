module.exports = {
  mainMenu() {
    return {
      type: 'button',
      body: { text: '¿Qué deseas hacer?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'ORDER', title: '🛒 Hacer pedido' } },
          { type: 'reply', reply: { id: 'HUMAN', title: '👤 Hablar con una persona' } }
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
            { id: 'PATITAS', title: '🐾 Patitas de pollo' },
            { id: 'PULMON', title: '🫁 Pulmón de res' },
            { id: 'OREJAS', title: '👂 Orejas de res' },
            { id: 'TRAQUEAS', title: '🦴 Tráqueas de res' },
            { id: 'BULLSTICK', title: '🥩 Bullstick' }
          ]
        }]
      }
    };
  }
};
