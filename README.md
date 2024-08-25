mu-cranker-router
=================

This is a library which allows you to easily create your own Cranker Router. 

Background
----------

Cranker is a load-balancing reverse proxy that is designed for systems with many HTTP services that need to
be exposed at a single endpoint. It was designed for fast-moving teams that need to deploy early and often
with no central configuration needed when a new service is introduced or an existing one is upgraded.

The key difference with other reverse proxies and load balancers is that each service connects via a "connector"
to one or more routers. This connection between connector and router is a websocket, and crucially it means
the service is self-configuring; the router knows where a service is and if it is available by the fact that
it has an active websocket connection for a service.

The direction that connections are made between the load balancer and the services is also reversed: it is the
service that makes an HTTP (websocket) connection to the router, rather than the other way around. This allows
patterns where services can be deployed on private networks, bound to localhost on ephemeral ports, with no
opened incoming TCP ports into the network needed.

Usage
-----

TODO

Cranker Routers consist of two parts: an HTTPS server which clients send requests to, and a Web Socket server
that connectors register to.

In mu-cranker-router, you are responsible for creating both servers with mu-server (or a single server that does both).

Because you create your own Mu Server, you have full control over which HTTP or HTTPS port you open, the SSL config,
HTTP2 config, authentication, and you can add handlers and filters etc. You can see Mu-Server documentation at <https://muserver.io/> 
but in a simple case, a server could look like the following:

````javascript
TODO
````

To try this, you can clone this repo and run TODO

