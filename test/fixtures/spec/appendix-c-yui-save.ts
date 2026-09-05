// Appendix C, example 4 (paper p. 20): YUI model.js `save`, total 20. Ported from JavaScript.
declare const EVT_ERROR: string;
declare const EVT_SAVE: string;

type Callback = (err: unknown, response?: unknown) => void;

interface Facade {
  options: unknown;
  response: unknown;
  error?: unknown;
  src?: string;
  parsed?: unknown;
}

interface Model {
  _saveEvent: unknown;
  changed: Record<string, unknown>;
  toJSON(): unknown;
  isNew(): boolean;
  _validate(data: unknown, cb: (err: unknown) => void): void;
  sync(action: string, options: unknown, cb: (err: unknown, response: unknown) => void): void;
  fire(name: string, facade: Facade): void;
  publish(name: string, config: { preventable: boolean }): unknown;
  _parse(response: unknown): unknown;
  setAttrs(attrs: unknown, options: unknown): void;
}

export const model = {
  save(this: Model, options: Record<string, unknown> | Callback, callback?: Callback): Model {
    const self = this;

    if (typeof options === "function") {                            // +1
      callback = options;
      options = {};
    }

    options || (options = {});                                      // +1

    self._validate(self.toJSON(), function (err: unknown) {
      if (err) {                                                    // +2 (nesting = 1)
        callback && callback.call(null, err);                       // +1
        return;
      }

      self.sync(self.isNew() ? "create" : "update",                 // +2 (nesting = 1)
        options, function (err2: unknown, response: unknown) {
          const facade: Facade = { options, response };
          let parsed: unknown;

          if (err2) {                                               // +3 (nesting = 2)
            facade.error = err2;
            facade.src = "save";
            self.fire(EVT_ERROR, facade);
          } else {                                                  // +1
            if (!self._saveEvent) {                                 // +4 (nesting = 3)
              self._saveEvent = self.publish(EVT_SAVE, { preventable: false });
            }

            if (response) {                                         // +4 (nesting = 3)
              parsed = facade.parsed = self._parse(response);
              self.setAttrs(parsed, options);
            }

            self.changed = {};
            self.fire(EVT_SAVE, facade);
          }

          callback && callback.apply(null, [err2, response]);       // +1
        });
    });
    return self;
  },                                                                // total complexity = 20
};
