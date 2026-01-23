# API

This package defines the HTTP API exposed by `@mono/server`.
It uses a library called `cerato` to achieve end-to-end typesafety, which has some docs inside its package in `node_modules`.

## Some specific rules for the API package

### Zod codecs

**TLDR:** When using `z.codec` the type sent over HTTP should be the first parameter, and the type used in the application code is the second parameter

Since the point of this library is to define the HTTP API for the frontend and backend, there's some cases where we need to consider how to properly transfer a certain kind of thing over the network. A really common example is dates. In the code, we want Javascript `Date` objects, but we can't transmit those over the network as-is. It's common instead to write them out as an ISO-8601 timestamp with timezone, and parse them as such on the other end. This usually implies some amount of manual work for API producers and consumers.

Recently, [with Zod v4.1 a 'codecs' feature](https://zod.dev/codecs) was introduced, which introduces bidirectional encoding and decoding. This allows us to define certain types of schemas that when we call `encode()` on it will produce a desired format suitable for returning via a HTTP response.

However, from Zod's perspective, there's nothing special about which type is on the 'encode' side, and which one is on the 'decode' side, so we must come up with a convention to stick to.

I think the only ordering that makes true sense in this context is for the wire transfer format to be the first argument to `z.codec`, since that is the type that is produced when we call `encode`, and encoding/marshalling to the wire format is very common.
