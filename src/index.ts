type UnionToIntersection<U> = (U extends any ? (p: U) => void : never) extends (
  p: infer I
) => void
  ? I
  : never;

//! Flow

type Flow = () => void;

export function Flow(flow: Flow) {
  return flow;
}

//! Shape

type Shape<S extends object> = {
  [P in keyof S]: S[P] extends (...args: any) => any ? never : S[P];
};

export function Shape<S extends Shape<S>, P extends keyof S>(
  shape: (shape: Partial<S>) => S,
  defaults?: Partial<S>
) {
  return (description?: Partial<Omit<S, P>>) => {
    const entity = shape({ ...defaults, ...description } as Partial<S>);

    Object.defineProperty(entity, "act", {
      value: ((...intentions) => {
        const entityCopy = {} as Record<
          keyof typeof entity | keyof ReturnType<typeof intentions[number]>,
          any
        >;

        for (const intention of intentions) {
          const actions = intention(entity);

          for (const action in actions) {
            entityCopy[action as keyof ReturnType<typeof intentions[number]>] =
              actions[action];
          }
        }

        for (const property in entity) {
          Object.defineProperty(
            entityCopy,
            property,
            Object.getOwnPropertyDescriptor(entity, property)!
          );
        }

        // TODO TEST IF BEHAVIORS COULD OVERWRITE PROPERTIES
        return entityCopy;
      }) as Act<S>[keyof Act<S>],
    });

    return entity as Act<S> & S;
  };
}

//! Wiring

type Wiring<W extends Wires<W>, S extends Shape<S>> = Partial<
  {
    [V in keyof W]: Extract<
      keyof S,
      {
        [P in keyof S]: S[P] extends W[V] ? P : never;
      }[keyof S]
    >;
  }
>;

type Act<S extends Shape<S>> = {
  act<I extends ((entity: S) => Behavior)[]>(
    ...intentions: I
  ): Act<S> & S & UnionToIntersection<ReturnType<I[number]>>;
};

function wireUp<W extends Wires<W>, S extends Shape<S>>(
  wiring: Wiring<W, S> | undefined,
  entity: S
) {
  const connectedWires: Partial<W> = {};

  for (const wire in wiring) {
    Object.defineProperty(
      connectedWires,
      wire,
      Object.getOwnPropertyDescriptor(entity, wiring[wire]!)!
    );
  }

  return connectedWires;
}

//! Behavior

type Behavior = Record<any, (...args: any) => any>;
type Wires<W extends object> = Shape<W>;
type Actions<B extends Behavior> = {
  [A in keyof B]: (...args: Parameters<B[A]>) => (() => ReturnType<B[A]>)[];
};

export function Behavior<B extends Behavior, W extends Wires<W>>(
  behavior: (wires: Partial<W>) => Actions<B>
) {
  return <S extends Shape<S>>(wiring?: Wiring<W, S>) => (entity: S) =>
    actionsToIntention(behavior(wireUp<W, S>(wiring, entity)));
}

function actionsToIntention<B extends Behavior>(actions: Actions<B>) {
  for (const action in actions) {
    actions[action] = ((...args) => {
      const functions = actions[action](...args);

      const lastElement = functions.length - 1;
      // TODO TEST EMPTY ARRAY AND SINGLE ELEMENT ARRAY
      for (let index = 0; index < lastElement; index++) {
        try {
          return functions[index]();
        } catch (error) {
          // TODO CALLBACK ERROR
        }
      }

      // Last function should be able to throw an error
      return functions[lastElement]();
    }) as B[Extract<keyof B, string>];
  }

  return actions as B;
}

//! Service

export function Service<I extends Shape<S>, S extends I, A extends Behavior>(
  initializer: () => I,
  shape: (shape: I) => S,
  behavior: (shape: I) => A,
  eager?: true
) {
  function service() {
    const init = initializer();
    const intention = actionsToIntention(behavior(init));
    const entity = shape(init);

    for (const property in entity) {
      Object.defineProperty(
        intention,
        property,
        Object.getOwnPropertyDescriptor(entity, property)!
      );
    }

    return intention as S &
      {
        [K in keyof A]: (
          ...args: Parameters<A[K]>
        ) => ReturnType<ReturnType<A[K]>[number]>;
      };
  }

  let serve: () => ReturnType<typeof service>;

  if (eager) {
    const instance = service();

    serve = () => instance;
  } else {
    let instance: ReturnType<typeof serve>;
    serve = () => instance ?? (instance = service());
  }

  return serve;
}
