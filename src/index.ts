/**
 * Image Tool for the Editor.js
 *
 * @author CodeX <team@codex.so>
 * @license MIT
 * @see {@link https://github.com/editor-js/image}
 *
 * To developers.
 * To simplify Tool structure, we split it to 4 parts:
 *  1) index.ts — main Tool's interface, public API and methods for working with data
 *  2) uploader.ts — module that has methods for sending files via AJAX: from device, by URL or File pasting
 *  3) ui.ts — module for UI manipulations: render, showing preloader, etc
 *  4) tunes.js — working with Block Tunes: render buttons, handle clicks
 *
 * For debug purposes there is a testing server
 * that can save uploaded files and return a Response {@link UploadResponseFormat}
 *
 *       $ node dev/server.js
 *
 * It will expose 8008 port, so you can pass http://localhost:8008 with the Tools config:
 *
 * image: {
 *   class: ImageTool,
 *   config: {
 *     endpoints: {
 *       byFile: 'http://localhost:8008/uploadFile',
 *       byUrl: 'http://localhost:8008/fetchUrl',
 *     }
 *   },
 * },
 */

import type { TunesMenuConfig } from "@editorjs/editorjs/types/tools";
import type { API, ToolboxConfig, PasteConfig, BlockToolConstructorOptions, BlockTool, BlockAPI } from '@editorjs/editorjs';
import './index.css';

import Ui from './ui';
import Uploader from './uploader';

import { IconAddBorder, IconStretch, IconAddBackground, IconPicture } from '@codexteam/icons';
import {
  ActionConfig,
  UploadResponseFormat,
  ImageToolData,
  ImageConfig,
  SizeOptions,
} from "./types/types";

type ImageToolConstructorOptions = BlockToolConstructorOptions<
  ImageToolData,
  ImageConfig
>;

export default class ImageTool implements BlockTool {
  /**
   * Editor.js API instance
   */
  private api: API;

  /**
   * Flag indicating read-only mode
   */
  private readOnly: boolean;

  /**
   * Current Block API instance
   */
  private block: BlockAPI;

  /**
   * Configuration for the ImageTool
   */
  private config: ImageConfig;

  /**
   * Uploader module instance
   */
  private uploader: Uploader;

  /**
   * UI module instance
   */
  private ui: Ui;

  /**
   * Stores current block data internally
   */
  private _data: ImageToolData;

  private isDataInit = false;

  /**
   * @param {object} tool - tool properties got from editor.js
   * @param {ImageToolData} tool.data - previously saved data
   * @param {ImageConfig} tool.config - user config for Tool
   * @param {object} tool.api - Editor.js API
   * @param {boolean} tool.readOnly - read-only mode flag
   * @param {BlockAPI|{}} tool.block - current Block API
   */
  constructor({
    data,
    config,
    api,
    readOnly,
    block,
  }: ImageToolConstructorOptions) {
    this.api = api;
    this.readOnly = readOnly;
    this.block = block;

    /**
     * Tool's initial config
     */
    this.config = {
      endpoints: config.endpoints,
      additionalRequestData: config.additionalRequestData,
      additionalRequestHeaders: config.additionalRequestHeaders,
      field: config.field,
      types: config.types,
      // captionPlaceholder: this.api.i18n.t(
      //   config.captionPlaceholder ? config.captionPlaceholder : "Caption"
      // ),
      buttonContent: config.buttonContent,
      uploader: config.uploader,
      actions: config.actions,
    };

    /**
     * Module for file uploading
     */
    this.uploader = new Uploader({
      config: this.config,
      onUpload: (response) => this.onUpload(response),
      onError: (error) => this.uploadingFailed(error),
    });

    /**
     * Module for working with UI
     */
    this.ui = new Ui({
      api,
      config: this.config,
      onSelectFile: () => {
        this.uploader.uploadSelectedFile({
          onPreview: (src: string) => {
            this.ui.showPreloader(src);
          },
        });
      },
      readOnly,
    });

    /**
     * Set saved state
     */
    this._data = {
      caption: "",
      withBorder: false,
      size: undefined,
      file: {
        url: "",
      },
    };
    this.data = data;
  }
  /**
   * Notify core that read-only mode is supported
   *
   * @returns {boolean}
   */
  static get isReadOnlySupported(): boolean {
    return true;
  }

  /**
   * Get Tool toolbox settings
   * icon - Tool icon's SVG
   * title - title to show in toolbox
   *
   * @returns {{icon: string, title: string}}
   */
  static get toolbox(): ToolboxConfig {
    return {
      icon: IconPicture,
      title: "Image",
    };
  }

  /**
   * Available image tools
   *
   * @returns {Array}
   */
  static get tunes(): Array<ActionConfig> {
    return [
      {
        name: "withBorder",
        icon: IconAddBorder,
        title: "With border",
        toggle: true,
      },
      {
        name: "size30",
        icon: IconStretch,
        title: "Resize to 30%",
        toggle: true,
      },
      {
        name: "size50",
        icon: IconStretch,
        title: "Resize to 50%",
        toggle: true,
      },
      {
        name: "size70",
        icon: IconStretch,
        title: "Resize to 70%",
        toggle: true,
      },
      {
        name: "size100",
        icon: IconStretch,
        title: "Resize to 100%",
        toggle: true,
      },
    ];
  }

  /**
   * Renders Block content
   *
   * @public
   *
   * @returns {HTMLDivElement}
   */
  render(): HTMLDivElement {
    return this.ui.render(this.data) as HTMLDivElement;
  }

  /**
   * Validate data: check if Image exists
   *
   * @param {ImageToolData} savedData — data received after saving
   * @returns {boolean} false if saved data is not correct, otherwise true
   * @public
   */
  validate(savedData: ImageToolData): boolean {
    return !!savedData.file.url;
  }

  /**
   * Return Block data
   *
   * @public
   *
   * @returns {ImageToolData}
   */
  save(): ImageToolData {
    // const caption = this.ui.nodes.caption;

    // this._data.caption = caption.innerHTML;

    return this.data;
  }

  /**
   * Returns configuration for block tunes: add background, add border, stretch image
   *
   * @public
   *
   * @returns TunesMenuConfig
   */
  renderSettings(): TunesMenuConfig {
    // Merge default tunes with the ones that might be added by user
    // @see https://github.com/editor-js/image/pull/49
    const tunes = ImageTool.tunes.concat(this.config.actions || []);

    return tunes.map((tune) => ({
      icon: tune.icon,
      label: this.api.i18n.t(tune.title),
      name: tune.name,
      toggle: tune.toggle,
      isActive: this.isTuneActive(tune.name),
      onActivate: () => {
        /**If it'a user defined tune, execute it's callback stored in action property */
        if (typeof tune.action === "function") {
          tune.action(tune.name);

          return;
        }
        this.tuneToggled(tune.name as keyof ImageToolData);
      },
    }));
  }

  isTuneActive(name: string): boolean {
    if (!name.startsWith("size")) {
      return this.data[name as keyof ImageToolData] as boolean;
    }
    if (this.data.size === undefined) {
      return false;
    }
    return "size" + this.data.size === name;
  }

  /**
   * Fires after clicks on the Toolbox Image Icon
   * Initiates click on the Select File button
   *
   * @public
   */
  appendCallback() {
    this.ui.nodes.fileButton.click();
  }

  /**
   * Specify paste substitutes
   *
   * @see {@link https://github.com/codex-team/editor.js/blob/master/docs/tools.md#paste-handling}
   * @returns {{tags: string[], patterns: object<string, RegExp>, files: {extensions: string[], mimeTypes: string[]}}}
   */
  static get pasteConfig(): PasteConfig {
    return {
      /**
       * Paste HTML into Editor
       */
      tags: [
        {
          img: { src: true },
        },
      ],
      /**
       * Paste URL of image into the Editor
       */
      patterns: {
        image: /https?:\/\/\S+\.(gif|jpe?g|tiff|png|svg|webp)(\?[a-z0-9=]*)?$/i,
      },

      /**
       * Drag n drop file from into the Editor
       */
      files: {
        mimeTypes: ["image/*"],
      },
    };
  }

  /**
   * Specify paste handlers
   *
   * @public
   * @see {@link https://github.com/codex-team/editor.js/blob/master/docs/tools.md#paste-handling}
   * @param {CustomEvent} event - editor.js custom paste event
   *                              {@link https://github.com/codex-team/editor.js/blob/master/types/tools/paste-events.d.ts}
   * @returns {void}
   */
  async onPaste(event: CustomEvent): Promise<void> {
    switch (event.type) {
      case "tag": {
        const image = event.detail.data;

        /** Images from PDF */
        if (/^blob:/.test(image.src)) {
          const response = await fetch(image.src);

          const file = await response.blob();

          this.uploadFile(file);
          break;
        }

        this.uploadUrl(image.src);
        break;
      }
      case "pattern": {
        const url = event.detail.data;

        this.uploadUrl(url);
        break;
      }
      case "file": {
        const file = event.detail.file;

        this.uploadFile(file);
        break;
      }
    }
  }

  /**
   * Private methods
   * ̿̿ ̿̿ ̿̿ ̿'̿'\̵͇̿̿\з= ( ▀ ͜͞ʖ▀) =ε/̵͇̿̿/’̿’̿ ̿ ̿̿ ̿̿ ̿̿
   */

  /**
   * Stores all Tool's data
   *
   * @private
   *
   * @param {ImageToolData} data - data in Image Tool format
   */
  set data(data: ImageToolData) {
    this.image = data.file;

    // this._data.caption = data.caption || "";
    this._data.size = data.size;
    // this.ui.fillCaption(this._data.caption);

    ImageTool.tunes.forEach(({ name: tune }) => {
      const value = this.isTuneActive(tune);
      this.setTune(tune as keyof ImageToolData, value);
    });

    this.isDataInit = true;
  }

  /**
   * Return Tool data
   *
   * @private
   *
   * @returns {ImageToolData}
   */
  get data(): ImageToolData {
    return this._data;
  }

  /**
   * Set new image file
   *
   * @private
   *
   * @param {object} file - uploaded file data
   */
  set image(file: { url: string } | undefined) {
    this._data.file = file || { url: "" };

    if (file && file.url) {
      this.ui.fillImage(file.url);
    }
  }

  /**
   * File uploading callback
   *
   * @private
   *
   * @param {UploadResponseFormat} response - uploading server response
   * @returns {void}
   */
  onUpload(response: UploadResponseFormat): void {
    if (response.success && response.file) {
      this.image = response.file;
    } else {
      this.uploadingFailed("incorrect response: " + JSON.stringify(response));
    }
  }

  /**
   * Handle uploader errors
   *
   * @private
   * @param {string} errorText - uploading error text
   * @returns {void}
   */
  uploadingFailed(errorText: string): void {
    console.log("Image Tool: uploading failed because of", errorText);

    this.api.notifier.show({
      message: this.api.i18n.t("Couldn’t upload image. Please try another."),
      style: "error",
    });
    this.ui.hidePreloader();
  }

  /**
   * Callback fired when Block Tune is activated
   *
   * @private
   *
   * @param {string} tuneName - tune that has been clicked
   * @returns {void}
   */
  tuneToggled(tuneName: keyof ImageToolData): void {
    // inverse tune state
    this.setTune(tuneName, !this.isTuneActive(tuneName));
  }

  /**
   * Set one tune
   *
   * @param {string} tuneName - {@link Tunes.tunes}
   * @param {boolean} value - tune state
   * @returns {void}
   */
  setTune(tuneName: string, value: boolean): void {
    if (tuneName.startsWith("size")) {
      if (!this.isDataInit) {
      } else if (value) {
        for (let item of ImageTool.tunes) {
          if (
            item.name.startsWith("size") &&
            item.name != tuneName &&
            this.isTuneActive(item.name)
          ) {
            const el = document.querySelector(
              `.ce-popover-item[data-item-name="${item.name}"]`
            );
            el?.classList.remove("ce-popover-item--active");
            this.ui.applyTune(item.name, false);
          }
        }
        this._data.size = tuneName.replace("size", "") as SizeOptions;
      } else {
        this._data.size = undefined;
      }
    } else {
      (this._data[tuneName as keyof ImageToolData] as boolean) = value;
    }

    this.ui.applyTune(tuneName, value);

    // if (tuneName === 'stretched') {
    //   /**
    //    * Wait until the API is ready
    //    */
    //   Promise.resolve().then(() => {
    //     this.block.stretched = value;
    //   })
    //     .catch(err => {
    //       console.error(err);
    //     });
    // }
  }

  /**
   * Show preloader and upload image file
   *
   * @param {File} file - file that is currently uploading (from paste)
   * @returns {void}
   */
  uploadFile(file: Blob): void {
    this.uploader.uploadByFile(file, {
      onPreview: (src: string) => {
        this.ui.showPreloader(src);
      },
    });
  }

  /**
   * Show preloader and upload image by target url
   *
   * @param {string} url - url pasted
   * @returns {void}
   */
  uploadUrl(url: string): void {
    this.ui.showPreloader(url);
    this.uploader.uploadByUrl(url);
  }
}
