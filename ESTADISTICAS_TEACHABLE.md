# 📊 Sistema de Estadísticas con Integración Teachable

## ✅ Implementación Completada

Se ha implementado un sistema completo de estadísticas similar al proyecto `test-oposiciones`, adaptado para exámenes de desarrollo con calificación por IA.

---

## 🗄️ Paso 1: Crear la Tabla en Supabase

Ejecuta el siguiente SQL en el editor de Supabase (SQL Editor):

```sql
-- Ejecutar el contenido del archivo: supabase/tables/examen_results.sql
```

O copia y pega directamente desde `/home/brayan/examenes-desarrollo/supabase/tables/examen_results.sql`

---

## 🌐 Paso 2: Insertar en Teachable

1. **Copia el código** del archivo `teachable-embed.html`
2. **Pega en una lección de Teachable** (modo HTML/código)
3. **IMPORTANTE**: Actualiza la URL base en el código:

```javascript
var baseUrl = 'https://examenes-desarrollo-n0jbwy9fl-brayan-romeros-projects.vercel.app';
```

Cámbiala por tu URL de producción de Vercel actual.

---

## 🎯 Funcionalidades Implementadas

### 1. **Lectura de Parámetros de Teachable**
La aplicación lee automáticamente desde la URL:
- `user_id`: ID del usuario en Teachable
- `user_email`: Email del usuario
- `user_name`: Nombre del usuario

### 2. **Guardado Automático de Resultados**
Después de cada examen, si el usuario viene de Teachable, se guardan automáticamente:
- Nota media (0-10)
- Puntuación total
- Número de preguntas
- Tiempo empleado
- Temas seleccionados
- Fecha y hora

### 3. **Pantalla de Estadísticas**
Incluye:

#### 📈 Tarjeta de Rendimiento
Muestra la nota media con un mensaje personalizado:

- **≥ 7.0**: 🎯 "¡Excelente preparación!" - Listo para el examen real
- **5.0-6.9**: 📚 "Buen progreso" - Necesita mejorar
- **< 5.0**: ⚠️ "Necesitas más preparación" - No suficiente para examen real

#### 📊 Historial de Exámenes
Tabla con todos los intentos mostrando:
- Fecha y hora
- Número de preguntas
- Nota media (con código de colores)
- Puntuación total
- Tiempo empleado

#### 👤 Info del Usuario
- Nombre del usuario
- Total de exámenes realizados

---

## 🎨 Diseño y UX

- **Botón de Estadísticas**: Solo visible para usuarios de Teachable
- **Código de colores**:
  - Verde (≥ 7): Excelente
  - Amarillo (5-6.9): Suficiente
  - Rojo (< 5): Insuficiente
- **Responsive**: Tabla con scroll horizontal en móviles
- **Mensajes motivacionales**: Feedback según rendimiento

---

## 📋 Estructura de la Base de Datos

Tabla `examen_results`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | ID autoincremental |
| `teachable_user_id` | text | ID del usuario en Teachable |
| `teachable_user_email` | text | Email del usuario |
| `teachable_user_name` | text | Nombre del usuario |
| `test_date` | timestamp | Fecha del examen |
| `num_questions` | integer | Número de preguntas |
| `average_score` | numeric | Nota media (0-10) |
| `total_score` | numeric | Puntuación total |
| `time_spent_seconds` | integer | Tiempo en segundos |
| `manual` | text | Manual seleccionado |
| `bloque` | text | Bloque seleccionado |
| `tema` | integer | Tema seleccionado |
| `temas_selected` | jsonb | Array de temas [{manual, bloque, tema}] |

---

## 🔧 Cómo Funciona

1. **Usuario accede desde Teachable** → URL incluye parámetros de usuario
2. **Completa el examen** → Responde preguntas de desarrollo
3. **Sistema evalúa con IA** → Calificación vectorial con text-embedding-3-large
4. **Guarda resultados automáticamente** → Insert en Supabase
5. **Usuario ve estadísticas** → Nota media + mensaje + historial completo

---

## 🚀 URLs de Producción

**App desplegada**: https://examenes-desarrollo-n0jbwy9fl-brayan-romeros-projects.vercel.app

**Para usar en Teachable**:
```
https://examenes-desarrollo-n0jbwy9fl-brayan-romeros-projects.vercel.app?user_id=123&user_email=user@example.com&user_name=Usuario
```

---

## ⚡ Comandos Útiles

```bash
# Ejecutar localmente
npm run dev

# Desplegar a Vercel
vercel --prod

# Ver logs en tiempo real
vercel logs https://examenes-desarrollo-n0jbwy9fl-brayan-romeros-projects.vercel.app --follow
```

---

## 📝 Notas Importantes

1. **Modo Guest vs Teachable**:
   - Sin parámetros: No se guardan estadísticas
   - Con parámetros: Se guardan y muestran estadísticas

2. **Sistema de Calificación**:
   - Muy estricto (0.00-0.74 similaridad = máx 1.5 pts)
   - Basado en embeddings de 3072 dimensiones
   - Evalúa comprensión, no solo palabras clave

3. **Privacidad**:
   - Cada usuario solo ve sus propios resultados
   - RLS habilitado en Supabase
   - Datos asociados a Teachable user_id/email

---

## ✨ Ventajas del Sistema

- ✅ Integración transparente con Teachable
- ✅ Feedback personalizado según rendimiento
- ✅ Historial completo de intentos
- ✅ Calificación justa y objetiva con IA
- ✅ Mensajes motivacionales adaptativos
- ✅ Diseño limpio y profesional

---

¡Sistema listo para usar en producción! 🎉
