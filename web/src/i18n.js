import React, { createContext, useContext, useMemo, useState } from 'react';

const translations = {
  en: {
    brand: 'CaribChat',
    appTitle: 'CaribChat Systems',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    dashboard: 'Dashboard',
    messages: 'Messages',
    automations: 'Automations',
    templates: 'Templates',
    billing: 'Billing',
    welcomeTitle: 'Welcome to CaribChat Systems',
    welcomeCopy: 'Preview of your full platform UI. Navigate to Messages, Automations, Templates and Billing to see pages.',
    inbox: 'Inbox',
    notConnected: 'WhatsApp not connected.',
    scanQrHint: 'Open the server terminal to scan the QR code. This panel refreshes every 5s.',
    noMessages: 'No messages yet.',
    composeRecipient: 'Recipient WhatsApp JID or phone',
    composePlaceholder: 'Type a message',
    send: 'Send',
    flows: 'Flows',
    newFlow: 'New Flow',
    save: 'Save',
    addTrigger: '+ Trigger: Text contains',
    addAction: '+ Action: Send reply',
    addWait: '+ Wait',
    addStepsHint: 'Add steps to build a flow.',
    templatesTitle: 'Templates',
    name: 'Name',
    category: 'Category',
    content: 'Content',
    create: 'Create',
    update: 'Update',
    cancel: 'Cancel',
    delete: 'Delete',
    noTemplates: 'No templates yet.',
    inbound: 'Inbound',
    outbound: 'Outbound',
    topContacts: 'Top Contacts',
    last14Days: 'Last 14 days',
  },
  es: {
    brand: 'CaribChat',
    appTitle: 'CaribChat Systems',
    login: 'Iniciar sesión',
    email: 'Correo',
    password: 'Contraseña',
    dashboard: 'Panel',
    messages: 'Mensajes',
    automations: 'Automatizaciones',
    templates: 'Plantillas',
    billing: 'Facturación',
    welcomeTitle: 'Bienvenido a CaribChat Systems',
    welcomeCopy: 'Vista previa de tu plataforma. Navega a Mensajes, Automatizaciones, Plantillas y Facturación.',
    inbox: 'Bandeja',
    notConnected: 'WhatsApp no conectado.',
    scanQrHint: 'Abre la terminal del servidor para escanear el código QR. Este panel se actualiza cada 5s.',
    noMessages: 'Aún no hay mensajes.',
    composeRecipient: 'JID o teléfono de WhatsApp',
    composePlaceholder: 'Escribe un mensaje',
    send: 'Enviar',
    flows: 'Flujos',
    newFlow: 'Nuevo flujo',
    save: 'Guardar',
    addTrigger: '+ Disparador: Texto contiene',
    addAction: '+ Acción: Enviar respuesta',
    addWait: '+ Esperar',
    addStepsHint: 'Agrega pasos para construir un flujo.',
    templatesTitle: 'Plantillas',
    name: 'Nombre',
    category: 'Categoría',
    content: 'Contenido',
    create: 'Crear',
    update: 'Actualizar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    noTemplates: 'No hay plantillas aún.',
    inbound: 'Entrantes',
    outbound: 'Salientes',
    topContacts: 'Contactos principales',
    last14Days: 'Últimos 14 días',
  }
};

const I18nContext = createContext({ t: (k)=>k, lang: 'en', setLang: ()=>{} });

export function I18nProvider({ children }) {
  const [lang, setLang] = useState('en');
  const t = useMemo(() => (key) => {
    const dict = translations[lang] || translations.en;
    return dict[key] || translations.en[key] || key;
  }, [lang]);
  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(){
  return useContext(I18nContext);
}
