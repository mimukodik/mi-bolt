import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Shell of the demo payment application: one outlet, no chrome. */
@Component({
  selector: 'pay-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class App {}
