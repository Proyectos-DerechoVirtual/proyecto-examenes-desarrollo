# Exámenes de Desarrollo - MVP

Aplicación web para práctica de exámenes de desarrollo con respuestas cortas sobre Derecho Procesal Civil, con corrección automática mediante IA.

## Características

- ✅ **Banco de 30 preguntas** sobre Derecho Procesal Civil (Procedimiento Ordinario y Verbal)
- ✅ **Selección aleatoria** de preguntas en cada examen
- ✅ **Configuración flexible**:
  - Número de preguntas: 5 a 30
  - Tiempo del examen: 10 minutos a 1 hora
- ✅ Respuestas cortas (5-8 líneas)
- ✅ Corrección automática con OpenAI GPT-4o-mini
- ✅ Feedback detallado y personalizado
- ✅ Puntuación de 0-10 por pregunta
- ✅ Análisis de puntos fuertes y áreas de mejora

## Tecnologías

- React 19 + TypeScript
- Vite
- OpenAI API (GPT-4)
- CSS personalizado (basado en test-oposiciones)

## Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Configurar la API key de OpenAI:
```bash
cp .env.example .env
# Editar .env y agregar tu API key
```

3. Iniciar la aplicación:
```bash
npm run dev
```

La aplicación estará disponible en http://localhost:5173

## Uso

1. En la pantalla de inicio, configura tu examen:
   - Selecciona el número de preguntas (5-30)
   - Elige la duración del examen (10-60 minutos)
2. Click en "Comenzar Examen"
3. Las preguntas se seleccionan aleatoriamente del banco de 30
4. Responde todas las preguntas antes de que termine el tiempo
5. Click en "Finalizar y Enviar"
6. Espera mientras la IA evalúa tus respuestas (puede tomar 30-60 segundos)
7. Revisa tus resultados y feedback detallado por pregunta

## Estructura del Proyecto

```
examenes-desarrollo/
├── public/
│   └── contenido-derecho.txt    # Contenido de referencia
├── src/
│   ├── lib/
│   │   └── openai.ts            # Integración con OpenAI
│   ├── App.tsx                   # Componente principal
│   ├── App.css                   # Estilos
│   ├── index.css                 # Estilos globales
│   └── main.tsx                  # Punto de entrada
├── .env                          # Variables de entorno (no subir a git)
├── .env.example                  # Plantilla de variables
├── package.json
└── vite.config.ts
```

## Notas Importantes

⚠️ **ADVERTENCIA**: Esta aplicación usa `dangerouslyAllowBrowser: true` en la configuración de OpenAI, lo cual expone la API key en el navegador. Esto es SOLO para el MVP. En producción, debes:

1. Crear un backend que maneje las llamadas a OpenAI
2. No exponer la API key en el frontend
3. Implementar autenticación y rate limiting

## Mejoras Futuras

- [ ] Backend para manejar las llamadas a OpenAI de forma segura
- [ ] Base de datos para guardar historial de exámenes
- [ ] Más temas de derecho
- [ ] Preguntas aleatorias de un banco de preguntas
- [ ] Estadísticas de progreso del alumno
- [ ] Modo de repaso de respuestas anteriores
- [ ] Exportar resultados a PDF

## Diferencias con test-oposiciones

Este proyecto se basa en la estructura visual de test-oposiciones pero:
- ❌ NO usa Supabase (sin base de datos)
- ❌ NO está configurado para Vercel
- ✅ Usa OpenAI para evaluación automática
- ✅ Preguntas de desarrollo (texto libre) en vez de opción múltiple
- ✅ Feedback detallado con IA

## Licencia

Uso educativo - MVP
