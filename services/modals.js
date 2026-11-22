/**
 * Discord modals as plain JSON (Discord allows at most 5 top-level components in one), and reading what
 * came back. Built as JSON so tests can check them without Discord.
 */

const C = { ActionRow: 1, StringSelect: 3, TextInput: 4, RoleSelect: 6, ChannelSelect: 8, TextDisplay: 10, Label: 18, FileUpload: 19, RadioGroup: 21, CheckboxGroup: 22 };
const TEXT = { Short: 1, Paragraph: 2 };
const MAX_COMPONENTS = 5;

const cut = (value, max) => {
  const s = String(value ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function modal(customId, title, components) {
  const list = components.filter(Boolean);
  if (list.length > MAX_COMPONENTS) throw new Error(`Modal ${customId} has ${list.length} components; Discord allows ${MAX_COMPONENTS}`);
  return { custom_id: customId, title: cut(title, 45), components: list };
}

const textDisplay = content => ({ type: C.TextDisplay, content: cut(content, 4000) });

function label(labelText, description, component) {
  return { type: C.Label, label: cut(labelText, 45), ...(description ? { description: cut(description, 100) } : {}), component };
}

function textInput(customId, { style = TEXT.Paragraph, required = false, max = 1000, min, placeholder, value } = {}) {
  return {
    type: C.TextInput, custom_id: customId, style, required, max_length: max,
    ...(min ? { min_length: min } : {}), ...(placeholder ? { placeholder: cut(placeholder, 100) } : {}),
    ...(value !== undefined && value !== null && value !== "" ? { value: cut(value, max) } : {})
  };
}

function radio(customId, options, { required = true } = {}) {
  return { type: C.RadioGroup, custom_id: customId, required, options: options.slice(0, 10).map(o => ({ value: cut(o.value, 100), label: cut(o.label, 100), ...(o.description ? { description: cut(o.description, 100) } : {}) })) };
}

function checkboxes(customId, options) {
  return {
    type: C.CheckboxGroup, custom_id: customId, required: false, min_values: 0, max_values: options.length,
    options: options.map(o => ({ value: o.value, label: cut(o.label, 100), ...(o.description ? { description: cut(o.description, 100) } : {}), ...(o.default ? { default: true } : {}) }))
  };
}

function fileUpload(customId, { max = 5 } = {}) {
  return { type: C.FileUpload, custom_id: customId, required: false, min_values: 0, max_values: max };
}

function channelSelect(customId, { required = false, current = null, types } = {}) {
  return {
    type: C.ChannelSelect, custom_id: customId, required, min_values: required ? 1 : 0, max_values: 1,
    ...(types ? { channel_types: types } : {}),
    ...(current ? { default_values: [{ id: String(current), type: "channel" }] } : {})
  };
}

function roleSelect(customId, { max = 1, current = [] } = {}) {
  return {
    type: C.RoleSelect, custom_id: customId, required: false, min_values: 0, max_values: max,
    ...(current.length ? { default_values: current.slice(0, max).map(id => ({ id: String(id), type: "role" })) } : {})
  };
}

/**
 * Reads a submitted modal into plain values, whatever discord.js version: { text(id), radio(id), checked(id) -> [],
 * files(id) -> [Attachment], channel(id) -> id | null, roles(id) -> [id] }. Missing fields read as empty.
 */
function reader(interaction) {
  const f = interaction.fields;
  const safe = (fn, fallback) => {
    try {
      const value = fn();
      return value === undefined || value === null ? fallback : value;
    } catch {
      return fallback;
    }
  };
  return {
    text: id => safe(() => f.getTextInputValue(id), "").trim(),
    radio: id => safe(() => f.getRadioGroup(id), null),
    checked: id => [...safe(() => f.getCheckboxGroup(id), [])],
    files: id => [...safe(() => f.getUploadedFiles(id)?.values(), [])],
    channel: id => {
      const found = safe(() => f.getSelectedChannels(id), null);
      const first = found ? [...found.values()][0] : null;
      return first ? String(first.id) : null;
    },
    roles: id => {
      const found = safe(() => f.getSelectedRoles(id), null);
      return found ? [...found.keys()].map(String) : [];
    }
  };
}

module.exports = { C, TEXT, MAX_COMPONENTS, modal, textDisplay, label, textInput, radio, checkboxes, fileUpload, channelSelect, roleSelect, reader };
