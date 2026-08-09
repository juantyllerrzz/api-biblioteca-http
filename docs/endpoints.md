# Contratos de la API

## Modelo `Book`

```typescript
interface Book {
  id: number;
  title: string;
  author: string;
  publicationYear: number;
  available: boolean;
}
```

## Reglas de negocio

- `id`: entero positivo único, generado por el servidor. El cliente nunca lo envía.
- `title`, `author`: obligatorios, se normalizan con `trim()`, no pueden quedar vacíos.
- `publicationYear`: entero entre 1450 y el año actual.
- `available`: booleano estricto (no acepta `"true"` como texto).
- `PATCH` requiere al menos un campo permitido (`title`, `author`, `publicationYear`, `available`) y rechaza cualquier intento de modificar `id`.

## GET /api/health

Verifica disponibilidad del servidor.

- `200 OK` → `{ "status": "ok", "booksInMemory": number, "timestamp": string }`

## GET /api/books

Lista libros, con filtros opcionales combinables por query string.

- `?author=texto` — coincidencia parcial, sin distinguir mayúsculas/minúsculas.
- `?available=true|false` — valor exacto; cualquier otro valor devuelve `400`.

Respuestas:
- `200 OK` → `{ "data": Book[], "total": number }`
- `400 VALIDATION_ERROR` → parámetro `available` inválido.

## GET /api/books/:bookId

Consulta un libro por id.

- `200 OK` → `{ "data": Book }`
- `400 VALIDATION_ERROR` → id no es un entero positivo.
- `404 BOOK_NOT_FOUND` → id válido pero inexistente.

## POST /api/books

Crea un libro. Body:

```json
{
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "publicationYear": 2008,
  "available": true
}
```

`available` es opcional (por defecto `true`).

- `201 Created` → `{ "message": string, "data": Book }`
- `400 VALIDATION_ERROR` → campo faltante, vacío o de tipo incorrecto.
- `400 INVALID_JSON` → body con JSON mal formado.

## PATCH /api/books/:bookId

Actualiza parcialmente un libro. Body con uno o más campos editables:

```json
{ "available": false }
```

- `200 OK` → `{ "message": string, "data": Book }`
- `400 VALIDATION_ERROR` → id inválido, body vacío, campo no permitido, intento de modificar `id`, o valor de campo inválido.
- `404 BOOK_NOT_FOUND` → libro inexistente.

## DELETE /api/books/:bookId

Elimina un libro.

- `204 No Content` → sin body.
- `400 VALIDATION_ERROR` → id inválido.
- `404 BOOK_NOT_FOUND` → libro inexistente.

## Ruta inexistente

- `404 ROUTE_NOT_FOUND` → `{ "error": "ROUTE_NOT_FOUND", "message": string, "method": string, "path": string }`

## Matriz de códigos de estado

| Código | Situación |
|--------|-----------|
| 200 OK | Consulta o actualización ejecutada correctamente |
| 201 Created | Libro creado correctamente |
| 204 No Content | Libro eliminado; no se devuelve body |
| 400 Bad Request | JSON inválido, id inválido, filtros inválidos o campos incorrectos |
| 404 Not Found | Libro o ruta inexistente |
| 500 Internal Server Error | Error inesperado no controlado |