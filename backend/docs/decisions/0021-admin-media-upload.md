# 0021 — Admin media upload

## Situation

The admin edit form gives a colour a new image. `POST /admin/media` (contract
2.1.0) takes one multipart part named `file` and answers `UploadedImage`. The
shop serves images from `catalog_image` by content hash (`MediaController`)
with a one-year immutable cache header, so an image id must never point at
new bytes.

## Decision

- The type is read from the bytes, never from the part's declared type or
  file name: PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, WebP `RIFF` at 0
  and `WEBP` at 8. Width and height come from the header: the JDK's PNG and
  JPEG `ImageIO` readers, and for WebP the `VP8X`, `VP8L` and `VP8 ` chunk
  headers parsed by hand (`ImageInspector`), because JDK 21 ships no WebP
  reader.
- A rejected file answers 422 `VALIDATION_FAILED` with one field error at
  `/file`: `EMPTY_FILE`, `UNSUPPORTED_IMAGE_TYPE` or `IMAGE_UNREADABLE`.
- The id is the SHA-256 hex of the bytes. Bytes already stored answer 200
  with the stored row; new bytes are saved and answer 201 with
  `Location: /api/v1/media/<id>`, the same URL as `src`. Two uploads of the
  same new bytes at once both end in 200 or 201: the losing insert breaks the
  primary key and is answered with the row the other one stored.
- The size limit stays Spring Boot's default,
  `spring.servlet.multipart.max-file-size` 1 MB and `max-request-size` 10 MB
  ([MultipartProperties at v4.1.1](https://raw.githubusercontent.com/spring-projects/spring-boot/v4.1.1/module/spring-boot-servlet/src/main/java/org/springframework/boot/servlet/autoconfigure/MultipartProperties.java)).
  The 85 catalogue PNGs are all 300×600 and 53,201–153,997 bytes (median
  81,066), so the largest uses about 15 % of the limit. Over the limit
  `ProblemAdvice` answers 413 `PAYLOAD_TOO_LARGE` with `params.maxBytes`.
- The answers come in this order: CSRF 403, session 401, a malformed
  multipart body 400 and an oversized part 413 (the DispatcherServlet
  resolves the body before any interceptor), an unknown query key or a text
  part 400 (`UnknownQueryParameterInterceptor`: a part without a filename is
  a request parameter), a missing `file` part 400, the image checks 422, then
  200 or 201.
- Orphans are kept: an uploaded image no product references, and the old
  image after a colour switches to a new one, stay in `catalog_image`, and
  their URLs keep working. There is no cleanup job.

## Consequences

- Tomcat swallows at most `server.tomcat.max-swallow-size` (2 MB) of an
  oversized body before it resets the connection, so a client sending far
  more than 2 MB may see a reset instead of the 413.
- `catalog_image` grows with every distinct upload; removing unreferenced
  rows is deferred.
- MockMvc does not run the servlet multipart parser, so the 413 is proven by
  the handler test in `ProblemAdviceTest`, not by `AdminMediaApiTest`.