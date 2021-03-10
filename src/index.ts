// TODO USE OMIT TO REMOVE REPLACED BEHAVIOR KEYS, IN ACT AND SERVICE

//! Utilities

type UnionToIntersection<U> = (U extends any ? (p: U) => void : never) extends (
  p: infer I
) => void
  ? I
  : never;

type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;

type FilterNoArgumentNoReturn<F> = F extends () => infer R
  ? R extends void
    ? F
    : never
  : never;

type ReadonlyKeys<T> = {
  [P in keyof T]-?: (<R>() => R extends { [Q in P]: T[P] } ? 1 : 2) extends <
    R
  >() => R extends { -readonly [Q in P]: T[P] } ? 1 : 2
    ? never
    : P;
}[keyof T];

type Clean<M extends object> = {
  [K in {
    [P in keyof M]: M[P] extends undefined ? never : P;
  }[keyof M]]: M[K];
};

//! Shape

type Shape<S extends object> = {
  [P in keyof S]: P extends BinderFunctionName
    ? never
    : S[P] extends Function
    ? FilterNoArgumentNoReturn<S[P]>
    : S[P];
};

type ReadonlyDetails<T> = {
  get?: (property: T) => T;
} & (T extends undefined
  ? //? Default value
    {
      def?: T;
    }
  : { def: T });

type WritableDetails<T> = ReadonlyDetails<T> & {
  set?: (newValue: T, setProperty: (newValue: T) => void) => void;
};

type ShapeDetails<S extends Shape<S>> = {
  // TODO OTHER KEYS SHOULD NOT BE ALLOWED (ARE CURRENTLY ALLOWED)
  [P in keyof S]: P extends ReadonlyKeys<S>
    ? ReadonlyDetails<S[P]>
    : WritableDetails<S[P]>;
};

type ShapeDefinition<S extends Shape<S>> = () => ShapeDetails<S>;

function resolveEntityFromDetails<S extends Shape<S>>(
  details: ShapeDetails<S>,
  propertyInitializerCallback: (
    key: keyof typeof details
  ) => typeof details[typeof key]["def"]
) {
  const entity = {} as S;

  function createAccessorDefiner(
    setValueCallback: typeof propertyInitializerCallback
  ) {
    return (key: keyof typeof details) => {
      const currentDetail = (details[key] as unknown) as WritableDetails<
        typeof details[typeof key]
      >;
      if (currentDetail.get || currentDetail.set) {
        //? Details act as a private entity, and def becomes the private value holder of the property
        Object.defineProperty(entity, key, {
          get: currentDetail.get
            ? () => currentDetail.get!(currentDetail.def as any)
            : undefined,
          set: currentDetail.set
            ? (newValue) =>
                currentDetail.set!(
                  newValue,
                  (newValue) => (currentDetail.def = newValue)
                )
            : undefined,
        });
        // TODO CHECK IF DEF AND DESCRIPTION PASS BY THE SETTER
        entity[key] = setValueCallback(key) as any;
      } else {
        entity[key] = setValueCallback(key) as S[keyof S];
      }
    };
  }

  const defineAccessors = createAccessorDefiner(propertyInitializerCallback);
  for (const key in details) defineAccessors(key);

  return entity;
}

export function shape<S extends Shape<S>>(shape: ShapeDefinition<S>) {
  // TODO SHOULD READONLY PROPERTIES BE IN DESCRIPTION (CURRENT BEHAVIOR)?
  return (description?: Partial<S>) => {
    const details = shape();
    const entity = resolveEntityFromDetails(
      details,
      description
        ? (key) => description[key] ?? details[key].def
        : (key) => details[key].def
    );

    const binderFunctionName: BinderFunctionName = "Act";
    // TODO TEST IF ACT IS ASSIGNED CORRECTLY IF THERE ALREADY IS AN 'ACT'
    Object.defineProperty(entity, binderFunctionName, {
      value: ((...intentions) => {
        const newObject = {} as Record<
          keyof typeof entity | keyof ReturnType<typeof intentions[number]>,
          any
        >;

        for (const intention of intentions) {
          const wiredIntention = intention(entity as S);

          for (const action in wiredIntention) {
            newObject[action as keyof ReturnType<typeof intentions[number]>] =
              wiredIntention[action];
          }
        }

        for (const property in entity) {
          Object.defineProperty(
            newObject,
            property,
            Object.getOwnPropertyDescriptor(entity, property)!
          );
        }

        // TODO TEST IF PROPERTIES COULD OVERWRITE ACTIONS
        return newObject;
      }) as Act<S>[keyof Act<S>],
    });

    return entity as Act<S> & S;
  };
}

//! Wiring

// TODO CHECK WHAT HAPPENS IF WRONG PROPERTIES ARE WIRED (USED TO BE ACCEPTED, BUT IS WRONG)
type Wiring<W extends Wires<W>, S extends Shape<S>> = Partial<
  Clean<
    {
      -readonly [V in keyof W]: {
        [P in keyof S]: V extends ReadonlyKeys<W>
          ? S[P] extends W[V]
            ? P
            : never
          : P extends ReadonlyKeys<S>
          ? never
          : Equals<S[P], W[V]> extends true
          ? P
          : never;
      }[keyof S];
    }
  >
>;

type BinderFunctionName = "Act";

type Act<S extends Shape<S>> = {
  Act<I extends ((entity: S) => Behavior)[]>(
    ...intentions: I | ((entity: S) => Behavior)[]
  ): Act<S> & S & UnionToIntersection<ReturnType<I[number]>>;
};

function wireUp<W extends Wires<W>, S extends Shape<S>>(
  wiring: Wiring<W, S> | undefined,
  entity: S
) {
  const connectedWires: Partial<W> = {};

  // TODO CHECK IF THIS WORKS WITH AND WITHOUT GETSETTERS
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

// TODO TRY TO REPLACE WITH FUNCTION TYPE
type Behavior = Record<any, (...args: any) => any>;
type Wires<W extends object> = Shape<W>;

export function behavior<B extends Behavior, W extends Wires<W>>(
  behavior: (wires: Partial<W>) => B
) {
  return <S extends Shape<S>>(wiring?: Wiring<W, S>) => (entity: S) =>
    behavior(wireUp<W, S>(wiring, entity));
}

// TODO IMPLEMENT ACTION AND REGISTER
// function actionsToIntention<B extends Behavior>(actions: Actions<B>) {
//   for (const action in actions) {
//     actions[action] = ((...args) => {
//       const functions = actions[action](...args);

//       const lastElement = functions.length - 1;
//       // TODO TEST EMPTY ARRAY AND SINGLE ELEMENT ARRAY
//       for (let index = 0; index < lastElement; index++) {
//         try {
//           return functions[index]();
//         } catch (error) {
//           // TODO CALLBACK ERROR
//         }
//       }

//       // Last function should be able to throw an error
//       return functions[lastElement]();
//     }) as B[Extract<keyof B, string>];
//   }

//   return actions as B;
// }

//! Service

export function service<B extends Behavior, S extends Shape<S> = object>(
  // TODO CHECK WHAT HAPPENS WITH NO SHAPE, ALSO TO THE TYPE OF SHAPE
  behavior: S extends Shape<infer T>
    ? // TODO THIS SHOULD RECOGNIZE THE ABSENCE OF A SHAPE AND CHANGE THE FUNCTION
      unknown extends T
      ? () => B
      : (shape: S) => B
    : never,
  // TODO INTELLISENSE DOESNT WORK CURRENTLY, IMPLEMENT IT
  shape?: ShapeDefinition<S>
) {
  // TODO SHOULD RETURN B IF NO SHAPE
  function service(): S & B {
    if (shape) {
      const details = shape();
      const entity = resolveEntityFromDetails(
        details,
        (key) => details[key].def
      );

      //? Intention acts as the final service
      const intention = behavior(entity);

      for (const property in entity) intention[property] = entity[property];

      // TODO TEST IF ACTIONS COULD OVERWRITE PROPERTIES
      return intention as any;
    } else {
      return (behavior as () => B)() as any;
    }
  }

  let instance: ReturnType<typeof service>;
  return () => instance ?? (instance = service());
}
