import TemplaterPlugin from "main";
import { ButtonComponent, PluginSettingTab, Setting } from "obsidian";
import { errorWrapperSync, TemplaterError } from "utils/Error";
import { log_error } from "utils/Log";
import { arraymove, get_tfiles_from_folder } from "utils/Utils";
import { FileSuggest, FileSuggestMode } from "./suggesters/FileSuggester";
import { FolderSuggest } from "./suggesters/FolderSuggester";
import { IntellisenseRenderOption } from "./RenderSettings/IntellisenseRenderOption";

export interface FolderTemplate {
    folder: string;
    template: string;
}

export interface FileTemplate {
    regex: string;
    template: string;
}

export const DEFAULT_SETTINGS: Settings = {
    command_timeout: 5,
    templates_folder: "",
    templates_pairs: [["", ""]],
    trigger_on_file_creation: false,
    auto_jump_to_cursor: false,
    enable_system_commands: false,
    shell_path: "",
    user_scripts_folder: "",
    folder_templates: [{ folder: "", template: "" }],
    file_templates: [{ regex: ".*", template: "" }],
    syntax_highlighting: true,
    syntax_highlighting_mobile: false,
    enabled_templates_hotkeys: [""],
    startup_templates: [""],
    intellisense_render:
        IntellisenseRenderOption.RenderDescriptionParameterReturn,
};

export interface Settings {
    command_timeout: number;
    templates_folder: string;
    templates_pairs: Array<[string, string]>;
    trigger_on_file_creation: boolean;
    auto_jump_to_cursor: boolean;
    enable_system_commands: boolean;
    shell_path: string;
    user_scripts_folder: string;
    folder_templates: Array<FolderTemplate>;
    file_templates: Array<FileTemplate>;
    syntax_highlighting: boolean;
    syntax_highlighting_mobile: boolean;
    enabled_templates_hotkeys: Array<string>;
    startup_templates: Array<string>;
    intellisense_render: number;
}

export class TemplaterSettingTab extends PluginSettingTab {
    icon = "templater-icon";

    constructor(private plugin: TemplaterPlugin) {
        super(plugin.app, plugin);
    }

    display(): void {
        this.containerEl.empty();

        this.add_template_folder_setting();
        this.add_syntax_highlighting_settings();
        this.add_auto_jump_to_cursor();
        this.add_trigger_on_new_file_creation_setting();
        if (this.plugin.settings.trigger_on_file_creation) {
            this.add_folder_templates_setting();
            this.add_file_templates_setting();
        }
        this.add_templates_hotkeys_setting();
        this.add_startup_templates_setting();
        this.add_user_script_functions_setting();
        this.add_user_system_command_functions_setting();
    }

    add_template_folder_setting(): void {
        new Setting(this.containerEl)
            .setName("Template folder location")
            .setDesc("Files in this folder will be available as templates.")
            .addSearch((cb) => {
                new FolderSuggest(this.app, cb.inputEl);
                cb.setPlaceholder("Example: folder1/folder2")
                    .setValue(this.plugin.settings.templates_folder)
                    .onChange((new_folder) => {
                        // Trim folder and Strip ending slash if there
                        new_folder = new_folder.trim();
                        new_folder = new_folder.replace(/\/$/, "");

                        this.plugin.settings.templates_folder = new_folder;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            });
    }

    add_syntax_highlighting_settings(): void {
        const desktopDesc = document.createDocumentFragment();
        desktopDesc.append(
            "Adds syntax highlighting for Templater commands in edit mode."
        );

        const mobileDesc = document.createDocumentFragment();
        mobileDesc.append(
            "Adds syntax highlighting for Templater commands in edit mode on " +
                "mobile."
        );

        new Setting(this.containerEl)
            .setName("Syntax highlighting on desktop")
            .setDesc(desktopDesc)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.syntax_highlighting)
                    .onChange((syntax_highlighting) => {
                        this.plugin.settings.syntax_highlighting =
                            syntax_highlighting;
                        this.plugin.save_settings();
                        this.plugin.event_handler.update_syntax_highlighting();
                    });
            });

        new Setting(this.containerEl)
            .setName("Syntax highlighting on mobile")
            .setDesc(mobileDesc)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.syntax_highlighting_mobile)
                    .onChange((syntax_highlighting_mobile) => {
                        this.plugin.settings.syntax_highlighting_mobile =
                            syntax_highlighting_mobile;
                        this.plugin.save_settings();
                        this.plugin.event_handler.update_syntax_highlighting();
                    });
            });
    }

    add_auto_jump_to_cursor(): void {
        const desc = document.createDocumentFragment();
        desc.append(
            "Automatically triggers ",
            desc.createEl("code", { text: "tp.file.cursor" }),
            " after inserting a template.",
            desc.createEl("br"),
            "You can also set a hotkey to manually trigger ",
            desc.createEl("code", { text: "tp.file.cursor" }),
            "."
        );

        new Setting(this.containerEl)
            .setName("Automatic jump to cursor")
            .setDesc(desc)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.auto_jump_to_cursor)
                    .onChange((auto_jump_to_cursor) => {
                        this.plugin.settings.auto_jump_to_cursor =
                            auto_jump_to_cursor;
                        this.plugin.save_settings();
                    });
            });
    }

    add_trigger_on_new_file_creation_setting(): void {
        new Setting(this.containerEl)
            .setName("Trigger Templater on new file creation")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.trigger_on_file_creation)
                    .onChange((trigger_on_file_creation) => {
                        this.plugin.settings.trigger_on_file_creation =
                            trigger_on_file_creation;
                        this.plugin.save_settings();
                        this.plugin.event_handler.update_trigger_file_on_creation();
                        // Force refresh
                        this.display();
                    });
            });
    }

    add_templates_hotkeys_setting(): void {
        new Setting(this.containerEl).setName("Template hotkeys").setHeading().addButton((cb) => {
            cb
                .setIcon('plus')
                .setCta()
                .onClick(() => {
                    this.plugin.settings.enabled_templates_hotkeys.push("");
                    this.plugin.save_settings();
                    // Force refresh
                    this.display();
                });
        });

        this.plugin.settings.enabled_templates_hotkeys.forEach(
            (template, index) => {
                const s = new Setting(this.containerEl)
                    .addSearch((cb) => {
                        new FileSuggest(
                            cb.inputEl,
                            this.plugin,
                            FileSuggestMode.TemplateFiles
                        );
                        cb.setPlaceholder("Example: folder1/template_file")
                            .setValue(template)
                            .onChange((new_template) => {
                                if (
                                    new_template &&
                                    this.plugin.settings.enabled_templates_hotkeys.contains(
                                        new_template
                                    )
                                ) {
                                    log_error(
                                        new TemplaterError(
                                            "This template is already bound to a hotkey"
                                        )
                                    );
                                    return;
                                }
                                this.plugin.command_handler.add_template_hotkey(
                                    this.plugin.settings
                                        .enabled_templates_hotkeys[index],
                                    new_template
                                );
                                this.plugin.settings.enabled_templates_hotkeys[
                                    index
                                ] = new_template;
                                this.plugin.save_settings();
                            });
                        // @ts-ignore
                        cb.containerEl.addClass("templater_search");
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("any-key")
                            .setTooltip("Configure Hotkey")
                            .onClick(() => {
                                // TODO: Replace with future "official" way to do this
                                // @ts-ignore
                                this.app.setting.openTabById("hotkeys");
                                // @ts-ignore
                                const tab = this.app.setting.activeTab;
                                tab.searchComponent.inputEl.value = template;
                                tab.updateHotkeyVisibility();
                            });
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("up-chevron-glyph")
                            .setTooltip("Move up")
                            .onClick(() => {
                                arraymove(
                                    this.plugin.settings
                                        .enabled_templates_hotkeys,
                                    index,
                                    index - 1
                                );
                                this.plugin.save_settings();
                                this.display();
                            });
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("down-chevron-glyph")
                            .setTooltip("Move down")
                            .onClick(() => {
                                arraymove(
                                    this.plugin.settings
                                        .enabled_templates_hotkeys,
                                    index,
                                    index + 1
                                );
                                this.plugin.save_settings();
                                this.display();
                            });
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("cross")
                            .setTooltip("Delete")
                            .onClick(() => {
                                this.plugin.command_handler.remove_template_hotkey(
                                    this.plugin.settings
                                        .enabled_templates_hotkeys[index]
                                );
                                this.plugin.settings.enabled_templates_hotkeys.splice(
                                    index,
                                    1
                                );
                                this.plugin.save_settings();
                                // Force refresh
                                this.display();
                            });
                    });
                s.infoEl.remove();
            }
        );
    }

    add_folder_templates_setting(): void {
        new Setting(this.containerEl).setName("Folder templates")
            .setHeading()
            .addButton((button: ButtonComponent) => {
                button
                    .setIcon('plus')
                    .setCta()
                    .onClick(() => {
                        this.plugin.settings.folder_templates.push({
                            folder: "",
                            template: "",
                        });
                        this.plugin.save_settings();
                        this.append_folder_template_row(
                            listEl,
                            this.plugin.settings.folder_templates.length - 1
                        );
                    });
            });

        const listEl = this.containerEl.createDiv();
        this.plugin.settings.folder_templates.forEach((_, index) => {
            this.append_folder_template_row(listEl, index);
        });
    }

    private append_folder_template_row(
        listEl: HTMLElement,
        index: number
    ): void {
        const folder_template =
            this.plugin.settings.folder_templates[index];
        const s = new Setting(listEl)
            .addSearch((cb) => {
                new FolderSuggest(this.app, cb.inputEl);
                cb.setPlaceholder("Folder")
                    .setValue(folder_template.folder)
                    .onChange((new_folder) => {
                        if (
                            new_folder &&
                            this.plugin.settings.folder_templates.some(
                                (e, i) => i !== index && e.folder == new_folder
                            )
                        ) {
                            log_error(
                                new TemplaterError(
                                    "This folder already has a template associated with it"
                                )
                            );
                            return;
                        }

                        this.plugin.settings.folder_templates[index].folder =
                            new_folder;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            })
            .addSearch((cb) => {
                new FileSuggest(
                    cb.inputEl,
                    this.plugin,
                    FileSuggestMode.TemplateFiles
                );
                cb.setPlaceholder("Template")
                    .setValue(folder_template.template)
                    .onChange((new_template) => {
                        this.plugin.settings.folder_templates[index].template =
                            new_template;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            })
            .addExtraButton((cb) => {
                cb.setIcon("up-chevron-glyph")
                    .setTooltip("Move up")
                    .onClick(() => {
                        arraymove(
                            this.plugin.settings.folder_templates,
                            index,
                            index - 1
                        );
                        this.plugin.save_settings();
                        this.display();
                    });
            })
            .addExtraButton((cb) => {
                cb.setIcon("down-chevron-glyph")
                    .setTooltip("Move down")
                    .onClick(() => {
                        arraymove(
                            this.plugin.settings.folder_templates,
                            index,
                            index + 1
                        );
                        this.plugin.save_settings();
                        this.display();
                    });
            })
            .addExtraButton((cb) => {
                cb.setIcon("cross")
                    .setTooltip("Delete")
                    .onClick(() => {
                        this.plugin.settings.folder_templates.splice(index, 1);
                        this.plugin.save_settings();
                        this.display();
                    });
            });
        s.infoEl.remove();
    }

    add_file_templates_setting(): void {
        new Setting(this.containerEl)
            .setName("File regex templates")
            .setHeading()
            .addButton((button: ButtonComponent) => {
                button
                    .setCta()
                    .setIcon('plus')
                    .onClick(() => {
                        this.plugin.settings.file_templates.push({
                            regex: "",
                            template: "",
                        });
                        this.plugin.save_settings();
                        this.append_file_template_row(
                            listEl,
                            this.plugin.settings.file_templates.length - 1
                        );
                    });
            });

        const listEl = this.containerEl.createDiv();
        this.plugin.settings.file_templates.forEach((_, index) => {
            this.append_file_template_row(listEl, index);
        });
    }

    private append_file_template_row(
        listEl: HTMLElement,
        index: number
    ): void {
        const file_template = this.plugin.settings.file_templates[index];
        const s = new Setting(listEl)
            .addText((cb) => {
                cb.setPlaceholder("File regex")
                    .setValue(file_template.regex)
                    .onChange((new_regex) => {
                        this.plugin.settings.file_templates[index].regex =
                            new_regex;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.inputEl.addClass("templater_search");
            })
            .addSearch((cb) => {
                new FileSuggest(
                    cb.inputEl,
                    this.plugin,
                    FileSuggestMode.TemplateFiles
                );
                cb.setPlaceholder("Template")
                    .setValue(file_template.template)
                    .onChange((new_template) => {
                        this.plugin.settings.file_templates[index].template =
                            new_template;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            })
            .addExtraButton((cb) => {
                cb.setIcon("up-chevron-glyph")
                    .setTooltip("Move up")
                    .onClick(() => {
                        arraymove(
                            this.plugin.settings.file_templates,
                            index,
                            index - 1
                        );
                        this.plugin.save_settings();
                        this.display();
                    });
            })
            .addExtraButton((cb) => {
                cb.setIcon("down-chevron-glyph")
                    .setTooltip("Move down")
                    .onClick(() => {
                        arraymove(
                            this.plugin.settings.file_templates,
                            index,
                            index + 1
                        );
                        this.plugin.save_settings();
                        this.display();
                    });
            })
            .addExtraButton((cb) => {
                cb.setIcon("cross")
                    .setTooltip("Delete")
                    .onClick(() => {
                        this.plugin.settings.file_templates.splice(index, 1);
                        this.plugin.save_settings();
                        this.display();
                    });
            });
        s.infoEl.remove();
    }

    add_startup_templates_setting(): void {
        new Setting(this.containerEl).setName("Startup templates").setHeading().addButton((cb) => {
            cb
                .setIcon('plus')
                .setCta()
                .onClick(() => {
                    this.plugin.settings.startup_templates.push("");
                    this.plugin.save_settings();
                    // Force refresh
                    this.display();
                });
        });

        this.plugin.settings.startup_templates.forEach((template, index) => {
            const s = new Setting(this.containerEl)
                .addSearch((cb) => {
                    new FileSuggest(
                        cb.inputEl,
                        this.plugin,
                        FileSuggestMode.TemplateFiles
                    );
                    cb.setPlaceholder("Example: folder1/template_file")
                        .setValue(template)
                        .onChange((new_template) => {
                            if (
                                new_template &&
                                this.plugin.settings.startup_templates.contains(
                                    new_template
                                )
                            ) {
                                log_error(
                                    new TemplaterError(
                                        "This startup template already exist"
                                    )
                                );
                                return;
                            }
                            this.plugin.settings.startup_templates[index] =
                                new_template;
                            this.plugin.save_settings();
                        });
                    // @ts-ignore
                    cb.containerEl.addClass("templater_search");
                })
                .addExtraButton((cb) => {
                    cb.setIcon("cross")
                        .setTooltip("Delete")
                        .onClick(() => {
                            this.plugin.settings.startup_templates.splice(
                                index,
                                1
                            );
                            this.plugin.save_settings();
                            // Force refresh
                            this.display();
                        });
                });
            s.infoEl.remove();
        });
    }

    add_user_script_functions_setting(): void {
        new Setting(this.containerEl)
            .setName("User script functions")
            .setHeading();

        let desc = document.createDocumentFragment();
        desc.append(
            "All JavaScript files in this folder will be loaded as CommonJS modules, to import custom user functions.",
            desc.createEl("br"),
            "The folder needs to be accessible from the vault.",
            desc.createEl("br"),
            "Check the ",
            desc.createEl("a", {
                href: "https://silentvoid13.github.io/Templater/",
                text: "documentation",
            }),
            " for more information."
        );

        new Setting(this.containerEl)
            .setName("Script files folder location")
            .setDesc(desc)
            .addSearch((cb) => {
                new FolderSuggest(this.app, cb.inputEl);
                cb.setPlaceholder("Example: folder1/folder2")
                    .setValue(this.plugin.settings.user_scripts_folder)
                    .onChange((new_folder) => {
                        this.plugin.settings.user_scripts_folder = new_folder;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            });

        new Setting(this.containerEl)
            .setName("User script intellisense")
            .setDesc(
                "Determine how you'd like to have user script intellisense render. Note values will not render if not in the script."
            )
            .addDropdown((cb) => {
                cb.addOption("0", "Turn off intellisense")
                    .addOption(
                        "1",
                        "Render method description, parameters list, and return"
                    )
                    .addOption(
                        "2",
                        "Render method description and parameters list"
                    )
                    .addOption("3", "Render method description and return")
                    .addOption("4", "Render method description")
                    .setValue(
                        this.plugin.settings.intellisense_render.toString()
                    )
                    .onChange((value) => {
                        this.plugin.settings.intellisense_render =
                            parseInt(value);
                        this.plugin.save_settings();
                    });
            });

        desc = document.createDocumentFragment();
        let name: string;
        if (!this.plugin.settings.user_scripts_folder) {
            name = "No user scripts folder set";
        } else {
            const files = errorWrapperSync(
                () =>
                    get_tfiles_from_folder(
                        this.app,
                        this.plugin.settings.user_scripts_folder
                    ),
                `User scripts folder doesn't exist`
            );
            if (!files || files.length === 0) {
                name = "No user scripts detected";
            } else {
                let count = 0;
                for (const file of files) {
                    if (file.extension === "js") {
                        count++;
                        desc.append(
                            desc.createEl("li", {
                                text: `tp.user.${file.basename}`,
                            })
                        );
                    }
                }
                name = `Detected ${count} User Script(s)`;
            }
        }

        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addExtraButton((extra) => {
                extra
                    .setIcon("sync")
                    .setTooltip("Refresh")
                    .onClick(() => {
                        // Force refresh
                        this.display();
                    });
            });
    }

    add_user_system_command_functions_setting(): void {
        let desc = document.createDocumentFragment();
        desc.append(
            "Allows you to create user functions linked to system commands.",
            desc.createEl("br"),
            desc.createEl("b", {
                text: "Warning: ",
            }),
            "It can be dangerous to execute arbitrary system commands from untrusted sources. Only run system commands that you understand, from trusted sources."
        );
        new Setting(this.containerEl)
            .setName("User system command functions")
            .setHeading();

        new Setting(this.containerEl)
            .setName("Enable user system command functions")
            .setDesc(desc)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enable_system_commands)
                    .onChange((enable_system_commands) => {
                        this.plugin.settings.enable_system_commands =
                            enable_system_commands;
                        this.plugin.save_settings();
                        // Force refresh
                        this.display();
                    });
            });

        if (this.plugin.settings.enable_system_commands) {
            new Setting(this.containerEl)
                .setName("Timeout")
                .setDesc("Maximum timeout in seconds for a system command.")
                .addText((text) => {
                    text.setPlaceholder("Timeout")
                        .setValue(
                            this.plugin.settings.command_timeout.toString()
                        )
                        .onChange((new_value) => {
                            const new_timeout = Number(new_value);
                            if (isNaN(new_timeout)) {
                                log_error(
                                    new TemplaterError(
                                        "Timeout must be a number"
                                    )
                                );
                                return;
                            }
                            this.plugin.settings.command_timeout = new_timeout;
                            this.plugin.save_settings();
                        });
                });

            desc = document.createDocumentFragment();
            desc.append(
                "Full path to the shell binary to execute the command with.",
                desc.createEl("br"),
                "This setting is optional and will default to the system's default shell if not specified.",
                desc.createEl("br"),
                "You can use forward slashes ('/') as path separators on all platforms if in doubt."
            );
            new Setting(this.containerEl)
                .setName("Shell binary location")
                .setDesc(desc)
                .addText((text) => {
                    text.setPlaceholder("Example: /bin/bash, ...")
                        .setValue(this.plugin.settings.shell_path)
                        .onChange((shell_path) => {
                            this.plugin.settings.shell_path = shell_path;
                            this.plugin.save_settings();
                        });
                });

            let i = 1;
            this.plugin.settings.templates_pairs.forEach((template_pair) => {
                const div = this.containerEl.createEl("div");
                div.addClass("templater_div");

                const title = this.containerEl.createEl("h4", {
                    text: "User function n°" + i,
                });
                title.addClass("templater_title");

                const setting = new Setting(this.containerEl)
                    .addExtraButton((extra) => {
                        extra
                            .setIcon("cross")
                            .setTooltip("Delete")
                            .onClick(() => {
                                const index =
                                    this.plugin.settings.templates_pairs.indexOf(
                                        template_pair
                                    );
                                if (index > -1) {
                                    this.plugin.settings.templates_pairs.splice(
                                        index,
                                        1
                                    );
                                    this.plugin.save_settings();
                                    // Force refresh
                                    this.display();
                                }
                            });
                    })
                    .addText((text) => {
                        const t = text
                            .setPlaceholder("Function name")
                            .setValue(template_pair[0])
                            .onChange((new_value) => {
                                const index =
                                    this.plugin.settings.templates_pairs.indexOf(
                                        template_pair
                                    );
                                if (index > -1) {
                                    this.plugin.settings.templates_pairs[
                                        index
                                    ][0] = new_value;
                                    this.plugin.save_settings();
                                }
                            });
                        t.inputEl.addClass("templater_template");

                        return t;
                    })
                    .addTextArea((text) => {
                        const t = text
                            .setPlaceholder("System command")
                            .setValue(template_pair[1])
                            .onChange((new_cmd) => {
                                const index =
                                    this.plugin.settings.templates_pairs.indexOf(
                                        template_pair
                                    );
                                if (index > -1) {
                                    this.plugin.settings.templates_pairs[
                                        index
                                    ][1] = new_cmd;
                                    this.plugin.save_settings();
                                }
                            });

                        t.inputEl.setAttr("rows", 2);
                        t.inputEl.addClass("templater_cmd");

                        return t;
                    });

                setting.infoEl.remove();

                div.appendChild(title);
                div.appendChild(this.containerEl.lastChild as Node);

                i += 1;
            });

            const div = this.containerEl.createEl("div");
            div.addClass("templater_div2");

            const setting = new Setting(this.containerEl).addButton(
                (button) => {
                    button
                        .setButtonText("Add new user function")
                        .setCta()
                        .onClick(() => {
                            this.plugin.settings.templates_pairs.push(["", ""]);
                            this.plugin.save_settings();
                            // Force refresh
                            this.display();
                        });
                }
            );
            setting.infoEl.remove();

            div.appendChild(this.containerEl.lastChild as Node);
        }
    }
}
