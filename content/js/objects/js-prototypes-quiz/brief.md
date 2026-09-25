A property read walks the **prototype chain**: the object's own properties
first, then its prototype's, and so on up to `Object.prototype` and `null`.
`class` is syntax over exactly that: methods live once on
`Class.prototype`, class *fields* are created on every instance, and
`instanceof` asks "is `Class.prototype` somewhere on this chain?".

Most "JavaScript is weird" bugs in class-heavy code — a spy that never
fires, a copy that stopped updating, an `instanceof` that is suddenly false in
production — are this model applied to a case nobody thought about. Work each
question out from the model.
