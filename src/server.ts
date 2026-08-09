import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

import { URL } from "node:url";

interface Book {
  id: number;
  title: string;
  author: string;
  publicationYear: number;
  available: boolean;
}

const PORT = Number(process.env.PORT ?? 3000);

const MIN_PUBLICATION_YEAR = 1450;

const ALLOWED_UPDATE_FIELDS = [
  "title",
  "author",
  "publicationYear",
  "available"
] as const;

const books: Book[] = [
  {
    id: 1,
    title: "Clean Code",
    author: "Robert C. Martin",
    publicationYear: 2008,
    available: true
  },
  {
    id: 2,
    title: "The Pragmatic Programmer",
    author: "Andrew Hunt y David Thomas",
    publicationYear: 1999,
    available: false
  }
];

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  response.end(JSON.stringify(payload));
}

function sendValidationError(
  response: ServerResponse,
  message: string
): void {
  sendJson(response, 400, {
    error: "VALIDATION_ERROR",
    message
  });
}

function sendBookNotFound(response: ServerResponse): void {
  sendJson(response, 404, {
    error: "BOOK_NOT_FOUND",
    message: "No existe un libro con el identificador solicitado"
  });
}

async function readJsonBody(
  request: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(
    Buffer.concat(chunks).toString("utf-8")
  );
}

function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// Un bookId válido es un entero positivo sin letras, decimales,
// ceros a la izquierda ni signo negativo (ej: "1", "23"; no "01", "-1", "1.5", "abc").
function parseBookId(pathname: string): number | null {
  const segment = pathname.split("/").pop() ?? "";

  if (!/^[1-9]\d*$/.test(segment)) {
    return null;
  }

  return Number(segment);
}

// Aplica trim() y valida que title/author no queden vacíos.
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const server = createServer(
  async (request, response) => {
    try {
      const method = request.method ?? "GET";

      const requestUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`
      );

      const { pathname, searchParams } = requestUrl;

      // GET /api/health
      if (method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          status: "ok",
          booksInMemory: books.length,
          timestamp: new Date().toISOString()
        });

        return;
      }

      // GET /api/books  (con filtros opcionales ?author= y ?available=)
      if (method === "GET" && pathname === "/api/books") {
        const authorQuery = searchParams
          .get("author")
          ?.toLowerCase();

        const availableParam = searchParams.get("available");
        let availableFilter: boolean | null = null;

        if (availableParam !== null) {
          if (availableParam !== "true" && availableParam !== "false") {
            sendValidationError(
              response,
              "El parámetro available debe ser true o false"
            );

            return;
          }

          availableFilter = availableParam === "true";
        }

        let results = books;

        if (authorQuery) {
          results = results.filter((book) =>
            book.author.toLowerCase().includes(authorQuery)
          );
        }

        if (availableFilter !== null) {
          results = results.filter(
            (book) => book.available === availableFilter
          );
        }

        sendJson(response, 200, {
          data: results,
          total: results.length
        });

        return;
      }

      // GET /api/books/:bookId
      if (
        method === "GET" &&
        pathname.startsWith("/api/books/")
      ) {
        const id = parseBookId(pathname);

        if (id === null) {
          sendValidationError(
            response,
            "El identificador debe ser un número entero positivo"
          );

          return;
        }

        const book = books.find((book) => book.id === id);

        if (!book) {
          sendBookNotFound(response);

          return;
        }

        sendJson(response, 200, { data: book });

        return;
      }

      // POST /api/books
      if (method === "POST" && pathname === "/api/books") {
        const body = await readJsonBody(request);

        if (!isPlainObject(body)) {
          sendValidationError(
            response,
            "El body debe ser un objeto JSON"
          );

          return;
        }

        const title = normalizeText(body.title);

        if (title === null) {
          sendValidationError(
            response,
            "El campo title es obligatorio"
          );

          return;
        }

        const author = normalizeText(body.author);

        if (author === null) {
          sendValidationError(
            response,
            "El campo author es obligatorio"
          );

          return;
        }

        const publicationYearValue = body.publicationYear;
        const currentYear = new Date().getFullYear();

        if (
          typeof publicationYearValue !== "number" ||
          !Number.isInteger(publicationYearValue) ||
          publicationYearValue < MIN_PUBLICATION_YEAR ||
          publicationYearValue > currentYear
        ) {
          sendValidationError(
            response,
            `El campo publicationYear debe ser un entero entre ${MIN_PUBLICATION_YEAR} y ${currentYear}`
          );

          return;
        }

        const availableValue = body.available;
        let available = true;

        if (availableValue !== undefined) {
          if (typeof availableValue !== "boolean") {
            sendValidationError(
              response,
              "El campo available debe ser un valor booleano"
            );

            return;
          }

          available = availableValue;
        }

        const newBook: Book = {
          id:
            books.length > 0
              ? Math.max(...books.map((book) => book.id)) + 1
              : 1,
          title,
          author,
          publicationYear: publicationYearValue,
          available
        };

        books.push(newBook);

        sendJson(response, 201, {
          message: "Libro creado correctamente",
          data: newBook
        });

        return;
      }

      // PATCH /api/books/:bookId
      if (
        method === "PATCH" &&
        pathname.startsWith("/api/books/")
      ) {
        const id = parseBookId(pathname);

        if (id === null) {
          sendValidationError(
            response,
            "El identificador debe ser un número entero positivo"
          );

          return;
        }

        const book = books.find((book) => book.id === id);

        if (!book) {
          sendBookNotFound(response);

          return;
        }

        const body = await readJsonBody(request);

        if (!isPlainObject(body)) {
          sendValidationError(
            response,
            "El body debe ser un objeto JSON"
          );

          return;
        }

        const keys = Object.keys(body);

        if (keys.length === 0) {
          sendValidationError(
            response,
            "Debes enviar al menos un campo para actualizar"
          );

          return;
        }

        if (keys.includes("id")) {
          sendValidationError(
            response,
            "No se permite modificar el id"
          );

          return;
        }

        const unknownField = keys.find(
          (key) =>
            !ALLOWED_UPDATE_FIELDS.includes(
              key as (typeof ALLOWED_UPDATE_FIELDS)[number]
            )
        );

        if (unknownField) {
          sendValidationError(
            response,
            `El campo ${unknownField} no está permitido`
          );

          return;
        }

        if (body.title !== undefined) {
          const title = normalizeText(body.title);

          if (title === null) {
            sendValidationError(
              response,
              "El campo title no puede quedar vacío"
            );

            return;
          }

          book.title = title;
        }

        if (body.author !== undefined) {
          const author = normalizeText(body.author);

          if (author === null) {
            sendValidationError(
              response,
              "El campo author no puede quedar vacío"
            );

            return;
          }

          book.author = author;
        }

        if (body.publicationYear !== undefined) {
          const publicationYearValue = body.publicationYear;
          const currentYear = new Date().getFullYear();

          if (
            typeof publicationYearValue !== "number" ||
            !Number.isInteger(publicationYearValue) ||
            publicationYearValue < MIN_PUBLICATION_YEAR ||
            publicationYearValue > currentYear
          ) {
            sendValidationError(
              response,
              `El campo publicationYear debe ser un entero entre ${MIN_PUBLICATION_YEAR} y ${currentYear}`
            );

            return;
          }

          book.publicationYear = publicationYearValue;
        }

        if (body.available !== undefined) {
          const availableValue = body.available;

          if (typeof availableValue !== "boolean") {
            sendValidationError(
              response,
              "El campo available debe ser un valor booleano"
            );

            return;
          }

          book.available = availableValue;
        }

        sendJson(response, 200, {
          message: "Libro actualizado correctamente",
          data: book
        });

        return;
      }

      // DELETE /api/books/:bookId
      if (
        method === "DELETE" &&
        pathname.startsWith("/api/books/")
      ) {
        const id = parseBookId(pathname);

        if (id === null) {
          sendValidationError(
            response,
            "El identificador debe ser un número entero positivo"
          );

          return;
        }

        const index = books.findIndex((book) => book.id === id);

        if (index === -1) {
          sendBookNotFound(response);

          return;
        }

        books.splice(index, 1);

        // 204 No Content: por definición HTTP esta respuesta
        // no lleva body, por eso no se usa sendJson aquí.
        response.writeHead(204);
        response.end();

        return;
      }

      // Ruta no encontrada
      sendJson(response, 404, {
        error: "ROUTE_NOT_FOUND",
        message: "La ruta solicitada no existe",
        method,
        path: pathname
      });

    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, {
          error: "INVALID_JSON",
          message: "El body contiene un JSON inválido"
        });

        return;
      }

      console.error("Error inesperado:", error);

      sendJson(response, 500, {
        error: "INTERNAL_SERVER_ERROR",
        message: "Ocurrió un error interno"
      });
    }
  }
);

server.listen(PORT, () => {
  console.log(
    `Servidor disponible en http://localhost:${PORT}`
  );
});