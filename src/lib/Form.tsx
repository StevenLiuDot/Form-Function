import * as React from "react";
import { componentStateEngine, StateEngine } from "./stateEngine";
import { FieldProps, FieldRecord, makeField } from "./Field";
import { SyntheticEvent } from "react";
import {
    validFn,
    ValidatorFn,
    ValidationResult,
    ValidationFieldResult
} from "./validators";

export type FieldValue = string | boolean | number;

export type FieldValueMap = Record<string, FieldValue>;
export type FieldMap = Record<string, FieldRecord>;

export type EventHandler = (values: FieldMap) => void;
export type MaybeEventHandler = EventHandler | undefined;

/**
 * Props supplied to the render component passed to Form
 * TOwnProps is the type of the Form render components own props
 * TFieldOwnProps is the type of the Field render components own props
 */
export interface InjectedFormProps<
    TOwnProps extends object | void = void,
    TFieldOwnProps extends object | void = void
> {
    Field: React.StatelessComponent<FieldProps<TFieldOwnProps>>;
    form: React.DetailedHTMLProps<
        React.FormHTMLAttributes<HTMLFormElement>,
        HTMLFormElement
    >;
    values: FieldMap;
    meta: {
        valid: boolean;
        submitted: boolean;
        errors: ValidationResult;
        isValidating: boolean;
    };
    actions: {
        reset: () => void;
        submit: () => void;
    };
    ownProps: TOwnProps;
}

/**
 * Props that can be passed to Form
 */
export interface FormProps<T extends object | void, U extends object | void> {
    name: string;
    render: React.SFC<InjectedFormProps<T, U>>;
    validators?: Record<string, ValidatorFn<FieldValue>>;
    initialValues?: FieldValueMap;
    onSubmit?: EventHandler;
    onSubmitFailed?: EventHandler;
    onChange?: EventHandler;
    renderProps?: T;
    stateEngine?: StateEngine<FormState>;
}

export interface FormState {
    fields: FieldMap;
    submitted: boolean;
    isValidating: boolean;
}

export class Form<
    T extends object | void,
    U extends object | void
> extends React.Component<FormProps<T, U>, FormState> {
    static defaultProps: Partial<FormProps<any, any>> = {
        initialValues: {},
        onSubmit: () => {},
        onSubmitFailed: () => {},
        onChange: () => {},
        renderProps: {}
    };

    private Field: React.StatelessComponent<FieldProps<U>>;
    private stateEngine: StateEngine<FormState>;

    /**
     * When a Form is instantiated, generate a state engine with initial empty
     * state - this will be filled in by Fields, and create the Field component
     * that will be injected.
     */
    constructor(props: FormProps<T, U>) {
        super(props);
        this.stateEngine =
            props.stateEngine ||
            componentStateEngine(this, {
                fields: {},
                submitted: false,
                isValidating: false
            });
        this.makeField();
    }

    /**
     * Generates the Field that will be passed in InjectedFormProps
     */
    private makeField = () => {
        this.Field = makeField(
            {
                onChange: this.handleFieldChange,
                validate: this.validate,
                getInitialValue: this.getInitialValue
            },
            this.stateEngine
        ) as any;
    };

    /**
     * Reset everything to initial values
     * State will be fleshed out by Field children when they are recreated
     */
    private reset = () => {
        this.stateEngine
            .set({
                fields: {},
                submitted: false
            })
            .then(this.makeField)
            .then(() => this.forceUpdate());
    };

    /**
     * Allows Fields to get to their initial state
     */
    private getInitialValue = (name: string) =>
        (this.props.initialValues as FieldValueMap)[name] || "";

    /**
     * Is every field passing validation
     */
    private allValid = (validationResult: FieldMap): boolean => {
        return Object.values(validationResult).every(
            r => r.meta.validation.valid
        );
    };

    private setValidating = (isValidating: boolean) => (
        validationResult: ValidationFieldResult
    ) => {
        this.stateEngine.set({
            isValidating
        });
        return validationResult;
    };

    /**
     * If there is a validator for field with name of {name}
     * then run it, otherwise return valid
     */
    private validate = async (
        name: string,
        value: FieldValue
    ): Promise<ValidationFieldResult> => {
        this.stateEngine.set({
            isValidating: true
        });

        if (!this.props.validators) {
            return Promise.resolve(validFn()).then(this.setValidating(false));
        }

        return (this.props.validators[name]
            ? Promise.resolve(this.props.validators[name](value))
            : Promise.resolve(validFn())
        ).then(this.setValidating(false));
    };

    /**
     * Called by Fields when their value changes
     * If a form onChange handler was passed as a prop, call it
     */
    private handleFieldChange = () => {
        (this.props.onChange as EventHandler)(
            this.stateEngine.select(s => s.fields)
        );
    };

    /**
     * On submit call either props.onSubmit or props.onFailedSubmit
     * depending on current validation status
     */
    private handleSubmit = (
        onSubmit: MaybeEventHandler,
        onFailedSubmit: MaybeEventHandler,
        valid: boolean,
        fields: FieldMap
    ) => (e?: SyntheticEvent<any>) => {
        e && e.preventDefault();
        this.stateEngine.set({ submitted: true });
        valid
            ? (onSubmit as EventHandler)(fields)
            : (onFailedSubmit as EventHandler)(fields);
    };

    render() {
        const {
            render,
            onSubmit,
            onSubmitFailed,
            name,
            renderProps
        } = this.props;

        const { submitted, fields, isValidating } = this.stateEngine.get();

        const valid = this.allValid(fields);

        /**
         * Filters out all keys from validationResult where valid is true,
         * if form is valid then we know this will be an empty object, so we can
         * just return that
         */
        const validationResult = valid
            ? {}
            : Object.entries(fields).reduce(
                  (out, [key, value]) =>
                      Object.assign(
                          {},
                          out,
                          value.meta.validation.error
                              ? {
                                    [key]: value.meta.validation
                                }
                              : {}
                      ),
                  {} as ValidationResult
              );

        const submit = this.handleSubmit(
            onSubmit,
            onSubmitFailed,
            valid,
            fields
        );

        return render({
            ownProps: renderProps as T,
            meta: {
                valid,
                submitted,
                errors: validationResult,
                isValidating
            },
            Field: this.Field,
            values: fields,
            actions: {
                reset: this.reset,
                submit
            },
            form: {
                name,
                onSubmit: submit
            }
        });
    }
}
