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

      // TODO: implementar los endpoints de libros restantes.
      // Utilice method, pathname, searchParams y readJsonBody().

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